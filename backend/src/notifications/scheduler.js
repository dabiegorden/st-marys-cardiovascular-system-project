/**
 * notifications/scheduler.js – background jobs (node-cron)
 *
 *   email-outbox      OUTBOX_CRON  (default every minute)  deliver due / retry failed-temporarily emails
 *   high-risk-digest  DIGEST_CRON  (default 07:00 daily)   summary of the last 24 h for admins
 */

import cron from "node-cron";
import { config } from "../config.js";
import { enqueueDailyDigest, processOutbox } from "./outbox.js";

const tasks = [];

export function startNotificationJobs() {
  const { outboxCron, digestCron, timezone, enabled } = config.email;

  if (!enabled) {
    console.warn("⚠  Email alerts disabled – set RESEND_API_KEY and RESEND_EMAIL_FROM to enable them.");
  }

  if (!cron.validate(outboxCron)) throw new Error(`Invalid OUTBOX_CRON expression: "${outboxCron}"`);
  tasks.push(
    cron.schedule(outboxCron, () => processOutbox(), { name: "email-outbox", timezone, noOverlap: true }),
  );

  if (digestCron !== "off") {
    if (!cron.validate(digestCron)) throw new Error(`Invalid DIGEST_CRON expression: "${digestCron}"`);
    tasks.push(
      cron.schedule(
        digestCron,
        () => enqueueDailyDigest().catch((err) => console.error("[email] Digest error:", err.message)),
        { name: "high-risk-digest", timezone, noOverlap: true },
      ),
    );
  }

  // Catch up on anything queued before the last restart
  processOutbox();
  console.log(
    `✓ Background jobs: email outbox (${outboxCron})` +
      (digestCron !== "off" ? `, daily digest (${digestCron}, ${timezone})` : ", daily digest off"),
  );
}

export function stopNotificationJobs() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}

export function jobSchedule() {
  const { outboxCron, digestCron, timezone } = config.email;
  return { outboxCron, digestCron, timezone };
}
