/**
 * notifications/mailer.js – thin wrapper around the Resend Node.js SDK
 */

import { Resend } from "resend";
import { config } from "../config.js";
import { classifyResendError } from "./templates.js";

const resend = config.email.apiKey ? new Resend(config.email.apiKey) : null;

/**
 * Send one email. The SDK returns { data, error } rather than throwing,
 * so both paths are normalised here.
 * @returns {Promise<{ ok: true, id: string } | { ok: false, retryable: boolean, message: string }>}
 */
export async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  if (!resend || !config.email.from) {
    return { ok: false, retryable: false, message: "Email is not configured (RESEND_API_KEY / RESEND_EMAIL_FROM)." };
  }
  try {
    const { data, error } = await resend.emails.send(
      { from: config.email.from, to: [to], subject, html, text },
      { idempotencyKey },
    );
    if (error) return { ok: false, ...classifyResendError(error) };
    return { ok: true, id: data?.id ?? null };
  } catch (err) {
    // Network failures can still throw – treat them as temporary
    return { ok: false, retryable: true, message: `network: ${err.message}` };
  }
}
