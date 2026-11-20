/**
 * notifications/scheduler.js – background jobs (node-cron)
 *
 *   alert-outbox       OUTBOX_CRON     (every minute)    deliver due email + SMS, retry with backoff
 *   case-escalation    ESCALATION_CRON (every 15 min)    escalate high-risk cases nobody acknowledged
 *   high-risk-digest   DIGEST_CRON     (07:00 daily)     summary of the last 24 h for admins
 *   drift-check        DRIFT_CRON      (Mon 08:00)       email admins if inputs have shifted significantly
 */

import cron from "node-cron";
import { config } from "../config.js";
import { enqueueDailyDigest, enqueueDriftAlert, processOutbox } from "./outbox.js";
import { processSmsOutbox } from "./sms-outbox.js";
import { escalateOverdueCases } from "../services/cases.js";
import { driftReport } from "../services/insights.js";

const tasks = [];

function schedule(name, expression, fn) {
  if (expression === "off") return false;
  if (!cron.validate(expression)) throw new Error(`Invalid cron expression for ${name}: "${expression}"`);
  tasks.push(
    cron.schedule(
      expression,
      () => Promise.resolve(fn()).catch((err) => console.error(`[${name}]`, err.message)),
      { name, timezone: config.email.timezone, noOverlap: true },
    ),
  );
  return true;
}

export async function runDriftCheck() {
  const report = await driftReport();
  if (!report?.reliable || report.overall !== "significant") return 0;
  const weekKey = new Intl.DateTimeFormat("en-CA", { timeZone: config.email.timezone }).format(new Date());
  return enqueueDriftAlert({ report, weekKey });
}

export function startNotificationJobs() {
  if (!config.email.enabled) console.warn("⚠  Email alerts disabled – set RESEND_API_KEY and RESEND_EMAIL_FROM.");
  if (!config.sms.enabled) console.warn("⚠  SMS alerts disabled – set ARKESEL_API_KEY and ARKESEL_SENDER_ID.");
  if (config.sms.enabled && config.sms.sandbox) console.warn("⚠  ARKESEL_SANDBOX=true – SMS are accepted by Arkesel but NOT delivered.");

  schedule("alert-outbox", config.email.outboxCron, () => Promise.all([processOutbox(), processSmsOutbox()]));
  schedule("case-escalation", config.followUp.escalationCron, () => escalateOverdueCases());
  const digest = schedule("high-risk-digest", config.email.digestCron, () => enqueueDailyDigest());
  const drift = schedule("drift-check", config.monitoring.driftCron, () => runDriftCheck());

  // Catch up on anything queued before the last restart
  processOutbox();
  processSmsOutbox();
  console.log(
    `✓ Background jobs: alerts (${config.email.outboxCron}), escalation (${config.followUp.escalationCron}, after ${config.followUp.escalationHours} h)` +
      `, digest (${digest ? config.email.digestCron : "off"}), drift (${drift ? config.monitoring.driftCron : "off"}) – ${config.email.timezone}`,
  );
}

export function stopNotificationJobs() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}

export function jobSchedule() {
  return {
    outboxCron: config.email.outboxCron,
    digestCron: config.email.digestCron,
    escalationCron: config.followUp.escalationCron,
    escalationHours: config.followUp.escalationHours,
    driftCron: config.monitoring.driftCron,
    timezone: config.email.timezone,
  };
}
