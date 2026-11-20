/**
 * notifications/arkesel.js – Arkesel SMS API v2 client
 * ====================================================
 *   POST https://sms.arkesel.com/api/v2/sms/send          { sender, message, recipients[], sandbox? }
 *   GET  https://sms.arkesel.com/api/v2/clients/balance-details
 *   GET  https://sms.arkesel.com/api/v3/sender-ids/{id}/status
 * Auth: "api-key" header. Status: 200 ok · 401 auth · 402 balance · 403 inactive
 * gateway · 422 validation · 500 internal (Arkesel docs, "Status Responses (V2)").
 */

import { config } from "../config.js";
import { classifyArkeselError } from "./sms-templates.js";

const BASE = "https://sms.arkesel.com";
const TIMEOUT_MS = 15_000;

async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "api-key": config.sms.apiKey, "Content-Type": "application/json", Accept: "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, ok: res.ok, json };
}

/**
 * @returns {Promise<{ ok: true, id: string|null } | { ok: false, retryable: boolean, message: string }>}
 */
export async function sendSms({ to, message }) {
  if (!config.sms.enabled) {
    return { ok: false, retryable: false, message: "SMS is not configured (ARKESEL_API_KEY / ARKESEL_SENDER_ID)." };
  }
  try {
    const { status, ok, json } = await call("/api/v2/sms/send", {
      method: "POST",
      body: { sender: config.sms.sender, message, recipients: [to], ...(config.sms.sandbox ? { sandbox: true } : {}) },
    });
    if (!ok || json?.status !== "success") return { ok: false, ...classifyArkeselError(status, json) };

    const entries = Array.isArray(json.data) ? json.data : [];
    const invalid = entries.find((e) => e && e["invalid numbers"])?.["invalid numbers"];
    if (invalid?.includes(to)) return { ok: false, retryable: false, message: `Arkesel rejected the number ${to} as invalid.` };
    const id = entries.find((e) => e?.recipient === to)?.id ?? entries[0]?.id ?? null;
    return { ok: true, id };
  } catch (err) {
    // A timeout may mean the SMS was accepted but the reply was lost.
    // Arkesel has no idempotency key, so do not retry timeouts (avoids duplicates);
    // connection failures (nothing sent) are retried.
    const timedOut = err.name === "TimeoutError" || err.name === "AbortError";
    return {
      ok: false,
      retryable: !timedOut,
      message: timedOut ? "Timed out waiting for Arkesel – not retried to avoid a duplicate SMS." : `network: ${err.message}`,
    };
  }
}

export async function getBalance() {
  if (!config.sms.apiKey) return null;
  try {
    const { ok, json } = await call("/api/v2/clients/balance-details");
    return ok && json?.status === "success" ? json.data : { error: json?.message ?? "Could not read balance" };
  } catch (err) {
    return { error: err.message };
  }
}

export async function getSenderIdStatus() {
  if (!config.sms.apiKey || !config.sms.sender) return null;
  try {
    const { status, json } = await call(`/api/v3/sender-ids/${encodeURIComponent(config.sms.sender)}/status`);
    if (status === 404) return { status: "not_found" };
    const d = json?.data ?? {};
    return { status: d.verification_status ?? json?.status ?? "unknown", message: d.verification_message ?? d.comment ?? null };
  } catch (err) {
    return { status: "unknown", message: err.message };
  }
}
