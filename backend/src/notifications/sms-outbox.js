/**
 * notifications/sms-outbox.js – SMS alerts through Arkesel (same outbox pattern as email)
 */

import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { users, smsNotifications } from "../db/schema.js";
import { config } from "../config.js";
import { sendSms } from "./arkesel.js";
import { createOutboxProcessor } from "./queue.js";
import { alertRecipientScope } from "./outbox.js";
import { escalationSms, highRiskSms, normalizeGhanaPhone, SMS_RETRY_DELAYS_MIN, testSms } from "./sms-templates.js";

const smsActive = and(eq(users.smsAlerts, true), isNotNull(users.phoneNumber), sql`coalesce(${users.banned}, false) = false`);

const smsQueue = createOutboxProcessor({
  name: "sms",
  table: smsNotifications,
  retryDelaysMin: SMS_RETRY_DELAYS_MIN,
  gapMs: 250,
  async deliver(row) {
    if (!config.sms.enabled) return { status: "skipped", reason: "SMS is not configured (ARKESEL_API_KEY / ARKESEL_SENDER_ID)." };
    if (!normalizeGhanaPhone(row.recipientPhone)) return { status: "skipped", reason: `Invalid phone number (${row.recipientPhone}).` };
    const r = await sendSms({ to: row.recipientPhone, message: row.message });
    return r.ok ? { status: "sent", providerMessageId: r.id } : { status: "error", retryable: r.retryable, message: r.message };
  },
});

export const processSmsOutbox = smsQueue.process;
export const kickSmsOutbox = smsQueue.kick;

async function insertRows(rows) {
  const valid = rows.filter((r) => normalizeGhanaPhone(r.recipientPhone));
  if (!valid.length) return 0;
  const inserted = await db
    .insert(smsNotifications)
    .values(valid)
    .onConflictDoNothing({ target: smsNotifications.dedupeKey })
    .returning({ id: smsNotifications.id });
  if (inserted.length) kickSmsOutbox();
  return inserted.length;
}

export async function enqueueHighRiskSms({ assessment, hospitalNumber, assessor }) {
  const recipients = await db
    .select({ id: users.id, phone: users.phoneNumber })
    .from(users)
    .where(alertRecipientScope(assessor?.id, smsActive));
  const message = highRiskSms({
    assessment,
    hospitalNumber,
    assessorName: assessor?.name,
    appUrl: config.email.appUrl,
    showHospitalNumber: config.email.showHospitalNumber,
  });
  return insertRows(
    recipients.map((r) => ({
      kind: "high_risk_alert",
      dedupeKey: `sms-high-risk/${assessment.id}/${r.id}`,
      recipientUserId: r.id,
      recipientPhone: r.phone,
      assessmentId: assessment.id,
      message,
    })),
  );
}

export async function enqueueEscalationSms({ caseRow, assessment, hospitalNumber, assigneeId, level, hours }) {
  const recipients = await db
    .select({ id: users.id, phone: users.phoneNumber })
    .from(users)
    .where(and(smsActive, or(eq(users.role, "admin"), eq(users.id, assigneeId ?? ""))));
  const message = escalationSms({ assessment, hospitalNumber, hours, appUrl: config.email.appUrl, showHospitalNumber: config.email.showHospitalNumber });
  return insertRows(
    recipients.map((r) => ({
      kind: "case_escalation",
      dedupeKey: `sms-escalation/${caseRow.id}/${level}/${r.id}`,
      recipientUserId: r.id,
      recipientPhone: r.phone,
      assessmentId: assessment.id,
      message,
    })),
  );
}

export async function enqueueTestSms(user) {
  if (!normalizeGhanaPhone(user.phoneNumber)) {
    const err = new Error("Add a valid Ghana phone number to your profile (Settings) first.");
    err.statusCode = 400;
    throw err;
  }
  const [row] = await db
    .insert(smsNotifications)
    .values({
      kind: "test",
      dedupeKey: `sms-test/${user.id}/${Date.now()}`,
      recipientUserId: user.id,
      recipientPhone: user.phoneNumber,
      message: testSms({ name: user.name.split(" ")[0] }),
    })
    .returning();
  kickSmsOutbox();
  return row;
}

export async function retrySms(id) {
  const [row] = await db
    .update(smsNotifications)
    .set({ status: "pending", nextAttemptAt: new Date(), lastError: null, attempts: 0 })
    .where(and(eq(smsNotifications.id, id), inArray(smsNotifications.status, ["failed", "skipped"])))
    .returning();
  if (row) kickSmsOutbox();
  return row ?? null;
}
