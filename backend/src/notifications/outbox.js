/**
 * notifications/outbox.js – queue and deliver alert emails
 * ========================================================
 * Flow
 *   1. An assessment is classified HIGH risk → one outbox row per recipient
 *      (unique dedupe key, rendered content stored) → immediate delivery attempt.
 *   2. A node-cron sweep (every minute) delivers anything still due: retries
 *      with exponential backoff, rows left behind by a restart, and digests.
 *   3. Rows are claimed with SELECT … FOR UPDATE SKIP LOCKED, so several API
 *      instances never send the same email twice; the dedupe key doubles as
 *      Resend's idempotency key for the same guarantee on the provider side.
 */

import { and, asc, desc, eq, gte, inArray, lte, lt, or, sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { users, emailNotifications, assessments, patients } from "../db/schema.js";
import { config } from "../config.js";
import { sendEmail } from "./mailer.js";
import {
  dailyDigestEmail,
  highRiskAlertEmail,
  isUndeliverableAddress,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MIN,
  testEmail,
} from "./templates.js";

const BATCH_SIZE = 20;
const SEND_GAP_MS = 150; // stay well under Resend's default 10 requests/second
const STALE_SENDING_MS = 10 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const activeUser = and(eq(users.highRiskAlerts, true), sql`coalesce(${users.banned}, false) = false`);

/* ------------------------------------------------------------------ */
/* Enqueue                                                             */
/* ------------------------------------------------------------------ */

async function insertRows(rows) {
  if (!rows.length) return 0;
  const inserted = await db
    .insert(emailNotifications)
    .values(rows)
    .onConflictDoNothing({ target: emailNotifications.dedupeKey })
    .returning({ id: emailNotifications.id });
  return inserted.length;
}

/**
 * Queue high-risk alerts for one assessment and trigger delivery.
 * Recipients: the assessing clinician + all admins (default), or all staff.
 * Users who switched alerts off, or are disabled, are excluded.
 * @returns {Promise<number>} number of recipients queued
 */
export async function enqueueHighRiskAlert({ assessment, hospitalNumber, assessor, modelVersion }) {
  const scope =
    config.email.recipients === "all_staff"
      ? activeUser
      : and(activeUser, or(eq(users.role, "admin"), eq(users.id, assessor?.id ?? "")));

  const recipients = await db.select({ id: users.id, name: users.name, email: users.email, role: users.role }).from(users).where(scope);

  const rows = recipients.map((r) => {
    const reason =
      r.id === assessor?.id
        ? "you performed this assessment"
        : r.role === "admin"
          ? "you are a CVD Support administrator"
          : "your hospital sends high-risk alerts to all clinical staff";
    const content = highRiskAlertEmail({
      recipientName: r.name,
      assessment,
      hospitalNumber,
      assessorName: assessor?.name,
      modelVersion,
      appUrl: config.email.appUrl,
      timezone: config.email.timezone,
      showHospitalNumber: config.email.showHospitalNumber,
      reason,
    });
    return {
      kind: "high_risk_alert",
      dedupeKey: `high-risk-alert/${assessment.id}/${r.id}`,
      recipientUserId: r.id,
      recipientEmail: r.email,
      assessmentId: assessment.id,
      ...content,
    };
  });

  const queued = await insertRows(rows);
  if (queued) kickOutbox();
  return queued;
}

/** Morning summary for admins of the previous 24 h of high-risk results. */
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

  const admins = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(activeUser, eq(users.role, "admin")));

  const day = new Intl.DateTimeFormat("en-CA", { timeZone: config.email.timezone }).format(now); // YYYY-MM-DD
  const rows = admins.map((a) => ({
    kind: "daily_digest",
    dedupeKey: `daily-digest/${day}/${a.id}`,
    recipientUserId: a.id,
    recipientEmail: a.email,
    ...dailyDigestEmail({
      recipientName: a.name,
      items,
      total: items.length,
      appUrl: config.email.appUrl,
      timezone: config.email.timezone,
      showHospitalNumber: config.email.showHospitalNumber,
      periodLabel: "in the last 24 hours",
    }),
  }));
  const queued = await insertRows(rows);
  if (queued) kickOutbox();
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

/** Manually re-queue a failed or skipped notification. */
export async function retryNotification(id) {
  const [row] = await db
    .update(emailNotifications)
    .set({ status: "pending", nextAttemptAt: new Date(), lastError: null, attempts: 0 })
    .where(and(eq(emailNotifications.id, id), inArray(emailNotifications.status, ["failed", "skipped"])))
    .returning();
  if (row) kickOutbox();
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Delivery                                                            */
/* ------------------------------------------------------------------ */

async function claimDue() {
  const due = db
    .select({ id: emailNotifications.id })
    .from(emailNotifications)
    .where(and(eq(emailNotifications.status, "pending"), lte(emailNotifications.nextAttemptAt, new Date())))
    .orderBy(asc(emailNotifications.createdAt))
    .limit(BATCH_SIZE)
    .for("update", { skipLocked: true });

  return db
    .update(emailNotifications)
    .set({ status: "sending" })
    .where(inArray(emailNotifications.id, due))
    .returning();
}

async function deliver(row) {
  const update = (values) => db.update(emailNotifications).set(values).where(eq(emailNotifications.id, row.id));

  if (!config.email.enabled) {
    return update({ status: "skipped", lastError: "Email is not configured (RESEND_API_KEY / RESEND_EMAIL_FROM)." });
  }
  if (isUndeliverableAddress(row.recipientEmail)) {
    return update({ status: "skipped", lastError: `Undeliverable address domain (${row.recipientEmail.split("@")[1]}). Update the user's email.` });
  }

  const attempts = row.attempts + 1;
  const result = await sendEmail({
    to: row.recipientEmail,
    subject: row.subject,
    html: row.html,
    text: row.text,
    idempotencyKey: row.dedupeKey,
  });

  if (result.ok) {
    return update({ status: "sent", attempts, providerMessageId: result.id, sentAt: new Date(), lastError: null });
  }

  const canRetry = result.retryable && attempts < MAX_ATTEMPTS;
  if (canRetry) {
    const delayMin = RETRY_DELAYS_MIN[attempts - 1] ?? 60;
    return update({ status: "pending", attempts, lastError: result.message, nextAttemptAt: new Date(Date.now() + delayMin * 60_000) });
  }
  console.error(`[email] Delivery failed permanently (${row.kind} → ${row.recipientEmail}): ${result.message}`);
  return update({ status: "failed", attempts, lastError: result.message });
}

let running = false;
let rerun = false;

/** Deliver everything that is due. Safe to call concurrently and from several instances. */
export async function processOutbox() {
  if (running) {
    rerun = true;
    return;
  }
  running = true;
  try {
    // Rows stuck in "sending" (process died mid-send) go back to the queue
    await db
      .update(emailNotifications)
      .set({ status: "pending" })
      .where(and(eq(emailNotifications.status, "sending"), lt(emailNotifications.updatedAt, new Date(Date.now() - STALE_SENDING_MS))));

    for (;;) {
      const batch = await claimDue();
      if (!batch.length) break;
      for (const row of batch) {
        await deliver(row).catch((err) => console.error("[email] deliver error:", err.message));
        await sleep(SEND_GAP_MS);
      }
      if (batch.length < BATCH_SIZE) break;
    }
  } catch (err) {
    console.error("[email] Outbox processing error:", err.message);
  } finally {
    running = false;
    if (rerun) {
      rerun = false;
      setImmediate(processOutbox);
    }
  }
}

/** Fire-and-forget delivery right after queueing (the cron sweep is the safety net). */
export function kickOutbox() {
  setImmediate(() => processOutbox());
}
