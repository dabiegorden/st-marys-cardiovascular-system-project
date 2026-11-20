/**
 * notifications/outbox.js – email alerts (Resend)
 * ===============================================
 * 1. An event (high-risk assessment, overdue case, drift, digest, test) queues
 *    one row per recipient with a unique dedupe key and the rendered email.
 * 2. Delivery is attempted immediately; the node-cron sweep retries with
 *    backoff and catches up after restarts (see queue.js).
 * 3. The dedupe key doubles as the Resend idempotency key.
 */

import { and, desc, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { users, emailNotifications, assessments, patients } from "../db/schema.js";
import { config } from "../config.js";
import { sendEmail } from "./mailer.js";
import { createOutboxProcessor } from "./queue.js";
import {
  dailyDigestEmail,
  driftAlertEmail,
  escalationEmail,
  highRiskAlertEmail,
  isUndeliverableAddress,
  RETRY_DELAYS_MIN,
  testEmail,
} from "./templates.js";

export const emailAlertsActive = and(eq(users.highRiskAlerts, true), sql`coalesce(${users.banned}, false) = false`);
const activeUser = emailAlertsActive;

const emailQueue = createOutboxProcessor({
  name: "email",
  table: emailNotifications,
  retryDelaysMin: RETRY_DELAYS_MIN,
  async deliver(row) {
    if (!config.email.enabled) return { status: "skipped", reason: "Email is not configured (RESEND_API_KEY / RESEND_EMAIL_FROM)." };
    if (isUndeliverableAddress(row.recipientEmail)) {
      return { status: "skipped", reason: `Undeliverable address domain (${row.recipientEmail.split("@")[1]}). Update the user's email.` };
    }
    const r = await sendEmail({ to: row.recipientEmail, subject: row.subject, html: row.html, text: row.text, idempotencyKey: row.dedupeKey });
    return r.ok ? { status: "sent", providerMessageId: r.id } : { status: "error", retryable: r.retryable, message: r.message };
  },
});

export const processOutbox = emailQueue.process;
export const kickOutbox = emailQueue.kick;

async function insertRows(rows) {
  if (!rows.length) return 0;
  const inserted = await db
    .insert(emailNotifications)
    .values(rows)
    .onConflictDoNothing({ target: emailNotifications.dedupeKey })
    .returning({ id: emailNotifications.id });
  if (inserted.length) kickOutbox();
  return inserted.length;
}

const common = () => ({
  appUrl: config.email.appUrl,
  timezone: config.email.timezone,
  showHospitalNumber: config.email.showHospitalNumber,
});

/** Who receives a high-risk alert (shared with SMS). */
export function alertRecipientScope(assessorId, activeCondition) {
  return config.email.recipients === "all_staff"
    ? activeCondition
    : and(activeCondition, or(eq(users.role, "admin"), eq(users.id, assessorId ?? "")));
}

export function recipientReason(r, assessorId) {
  return r.id === assessorId
    ? "you performed this assessment"
    : r.role === "admin"
      ? "you are a CVD Support administrator"
      : "your hospital sends high-risk alerts to all clinical staff";
}

/* ------------------------------------------------------------------ */

export async function enqueueHighRiskAlert({ assessment, hospitalNumber, assessor, modelVersion }) {
  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(users)
    .where(alertRecipientScope(assessor?.id, activeUser));

  return insertRows(
    recipients.map((r) => ({
      kind: "high_risk_alert",
      dedupeKey: `high-risk-alert/${assessment.id}/${r.id}`,
      recipientUserId: r.id,
      recipientEmail: r.email,
      assessmentId: assessment.id,
      ...highRiskAlertEmail({
        ...common(),
        recipientName: r.name,
        assessment,
        hospitalNumber,
        assessorName: assessor?.name,
        modelVersion,
        reason: recipientReason(r, assessor?.id),
      }),
    })),
  );
}

/** Overdue follow-up: notify all admins (and the assigned clinician). */
export async function enqueueEscalationEmail({ caseRow, assessment, hospitalNumber, assigneeId, assigneeName, level, hours }) {
  const recipients = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(activeUser, or(eq(users.role, "admin"), eq(users.id, assigneeId ?? ""))));

  return insertRows(
    recipients.map((r) => ({
      kind: "case_escalation",
      dedupeKey: `case-escalation/${caseRow.id}/${level}/${r.id}`,
      recipientUserId: r.id,
      recipientEmail: r.email,
      assessmentId: assessment.id,
      ...escalationEmail({ ...common(), recipientName: r.name, assessment, hospitalNumber, assigneeName, hours, level }),
    })),
  );
}

export async function enqueueDriftAlert({ report, weekKey }) {
  const admins = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(activeUser, eq(users.role, "admin")));
  return insertRows(
    admins.map((a) => ({
      kind: "drift_alert",
      dedupeKey: `drift-alert/${weekKey}/${a.id}`,
      recipientUserId: a.id,
      recipientEmail: a.email,
      ...driftAlertEmail({ ...common(), recipientName: a.name, report }),
    })),
  );
}

export async function enqueueDailyDigest(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600 * 1000);
  const items = await db
    .select({
      id: assessments.id,
      createdAt: assessments.createdAt,
      probability: assessments.probability,
      hospitalNumber: patients.hospitalNumber,
      clinicianName: users.name,
    })
    .from(assessments)
    .innerJoin(patients, eq(assessments.patientId, patients.id))
    .leftJoin(users, eq(assessments.userId, users.id))
    .where(and(eq(assessments.riskBand, "high"), gte(assessments.createdAt, since), lt(assessments.createdAt, now)))
    .orderBy(desc(assessments.createdAt));

  if (!items.length) {
    console.log("[email] Daily digest: no high-risk assessments in the last 24 h – nothing sent");
    return 0;
  }
  const admins = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(and(activeUser, eq(users.role, "admin")));
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: config.email.timezone }).format(now);
  const queued = await insertRows(
    admins.map((a) => ({
      kind: "daily_digest",
      dedupeKey: `daily-digest/${day}/${a.id}`,
      recipientUserId: a.id,
      recipientEmail: a.email,
      ...dailyDigestEmail({ ...common(), recipientName: a.name, items, total: items.length, periodLabel: "in the last 24 hours" }),
    })),
  );
  console.log(`[email] Daily digest queued for ${queued} admin(s) (${items.length} high-risk assessments)`);
  return queued;
}

export async function enqueueTestEmail(user) {
  const [row] = await db
    .insert(emailNotifications)
    .values({
      kind: "test",
      dedupeKey: `test-email/${user.id}/${Date.now()}`,
      recipientUserId: user.id,
      recipientEmail: user.email,
      ...testEmail({ recipientName: user.name, appUrl: config.email.appUrl }),
    })
    .returning();
  kickOutbox();
  return row;
}

export async function retryNotification(id) {
  const [row] = await db
    .update(emailNotifications)
    .set({ status: "pending", nextAttemptAt: new Date(), lastError: null, attempts: 0 })
    .where(and(eq(emailNotifications.id, id), inArray(emailNotifications.status, ["failed", "skipped"])))
    .returning();
  if (row) kickOutbox();
  return row ?? null;
}
