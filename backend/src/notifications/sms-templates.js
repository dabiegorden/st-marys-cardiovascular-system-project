/**
 * notifications/sms-templates.js – SMS text and phone helpers (pure, unit-tested)
 *
 * SMS rules
 * - Plain GSM-7 characters only: a single non-GSM character (e.g. "•", "–")
 *   switches the whole message to UCS-2 and cuts a segment from 160 to 70 chars.
 * - No clinical values; the hospital number is masked (***0412) unless enabled.
 */

export function normalizeGhanaPhone(input) {
  if (input === null || input === undefined) return null;
  let d = String(input).replace(/[\s\-().]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  if (d.startsWith("00")) d = d.slice(2);
  if (/^0\d{9}$/.test(d)) d = `233${d.slice(1)}`; // 0241234567 → 233241234567
  if (/^\d{9}$/.test(d)) d = `233${d}`; // 241234567 → 233241234567
  return /^233\d{9}$/.test(d) ? d : null;
}

export const displayPhone = (p) => (p && /^233\d{9}$/.test(p) ? `+233 ${p.slice(3, 5)} ${p.slice(5, 8)} ${p.slice(8)}` : p ?? "");

export function maskForSms(hn, show = false) {
  if (!hn) return "unknown";
  return show ? hn : `***${hn.replace(/\s+/g, "").slice(-4)}`;
}

const pct = (p) => (p >= 0.995 ? ">99%" : p <= 0.005 ? "<1%" : `${Math.round(p * 100)}%`);

/** Replace characters outside the GSM-7 basic set with safe equivalents. */
export function toGsm(text) {
  return String(text)
    .replace(/[‘’`´]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[•·]/g, "*")
    .replace(/…/g, "...")
    .replace(/[^\x20-\x7E\n]/g, "");
}

export function highRiskSms({ assessment, hospitalNumber, assessorName, appUrl, showHospitalNumber }) {
  return toGsm(
    `CVD ALERT: High-risk result (${pct(assessment.probability)}) for patient ${maskForSms(hospitalNumber, showHospitalNumber)}` +
      `${assessorName ? `, assessed by ${assessorName}` : ""}. Please review: ${appUrl}/assessments/${assessment.id}`,
  );
}

export function escalationSms({ assessment, hospitalNumber, hours, appUrl, showHospitalNumber }) {
  return toGsm(
    `CVD ESCALATION: High-risk patient ${maskForSms(hospitalNumber, showHospitalNumber)} (${pct(assessment.probability)}) ` +
      `not acknowledged after ${hours}h. Review now: ${appUrl}/assessments/${assessment.id}`,
  );
}

export const testSms = ({ name }) => toGsm(`CVD Support: test message for ${name}. SMS alerts are working.`);

export function smsSegments(text) {
  const len = String(text).length;
  return len <= 160 ? 1 : Math.ceil(len / 153);
}

/**
 * Classify an Arkesel v2 response failure.
 * 401 auth, 402 insufficient balance, 403 inactive gateway, 422 validation → permanent.
 * 429, 5xx and network errors → retry.
 */
export function classifyArkeselError(status, body) {
  const message = `${status || "network"}: ${body?.message ?? body?.status ?? "request failed"}`;
  const retryable = !status || status === 429 || status >= 500;
  return { retryable, message };
}

/** SMS retries are few: Arkesel has no idempotency key, so a retry after an
 *  ambiguous failure could duplicate a message. */
export const SMS_RETRY_DELAYS_MIN = [1, 5, 15];
