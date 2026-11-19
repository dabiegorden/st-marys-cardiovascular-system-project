/**
 * Email notification tests – pure functions only (no network, no database).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyResendError,
  dailyDigestEmail,
  escapeHtml,
  highRiskAlertEmail,
  isUndeliverableAddress,
  maskHospitalNumber,
  MAX_ATTEMPTS,
  RETRY_DELAYS_MIN,
} from "../src/notifications/templates.js";

const base = {
  recipientName: "Dr Ama <script>",
  assessment: { id: "a1b2", createdAt: "2026-11-19T10:30:00Z", probability: 0.874 },
  hospitalNumber: "SMH/2026/00412",
  assessorName: "Kofi Boateng",
  modelVersion: "rf-v1",
  appUrl: "https://cvd.example-hospital.org",
  timezone: "Africa/Accra",
  showHospitalNumber: false,
  reason: "you performed this assessment",
};

test("hospital numbers are masked by default", () => {
  assert.equal(maskHospitalNumber("SMH/2026/00412"), "•••0412");
  assert.equal(maskHospitalNumber("SMH/2026/00412", true), "SMH/2026/00412");
  assert.equal(maskHospitalNumber(null), "—");
});

test("HTML is escaped", () => {
  assert.equal(escapeHtml(`<b>"x" & 'y'</b>`), "&lt;b&gt;&quot;x&quot; &amp; &#39;y&#39;&lt;/b&gt;");
});

test("high-risk alert contains the link, masked number and no full hospital number", () => {
  const e = highRiskAlertEmail(base);
  assert.match(e.subject, /High-risk/);
  assert.match(e.subject, /•••0412/);
  assert.match(e.subject, /87\.4%/);
  for (const body of [e.html, e.text]) {
    assert.ok(body.includes("https://cvd.example-hospital.org/assessments/a1b2"));
    assert.ok(!body.includes("SMH/2026/00412"), "full hospital number must not leak");
  }
  assert.ok(!e.html.includes("<script>"), "recipient name must be escaped");
  assert.ok(e.html.includes("Dr Ama &lt;script&gt;"));
});

test("high-risk alert shows the full number only when enabled", () => {
  const e = highRiskAlertEmail({ ...base, showHospitalNumber: true });
  assert.ok(e.text.includes("SMH/2026/00412"));
});

test("alerts carry no clinical input values", () => {
  const e = highRiskAlertEmail(base);
  for (const word of ["cholesterol", "blood pressure", "oldpeak", "chest pain"]) {
    assert.ok(!e.text.toLowerCase().includes(word));
  }
});

test("daily digest lists items and caps the table at 20", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({
    id: `id${i}`,
    createdAt: "2026-11-19T08:00:00Z",
    probability: 0.9,
    hospitalNumber: `SMH/2026/${1000 + i}`,
    clinicianName: "Dr X",
  }));
  const e = dailyDigestEmail({ recipientName: "Admin", items, total: 25, appUrl: base.appUrl, timezone: "Africa/Accra", showHospitalNumber: false, periodLabel: "in the last 24 hours" });
  assert.match(e.subject, /25 high-risk assessments/);
  assert.ok(e.html.includes("…and 5 more"));
  assert.ok(e.html.includes("/assessments/id0"));
  assert.ok(!e.html.includes("/assessments/id24"));
});

test("undeliverable address domains are detected", () => {
  for (const a of ["admin@stmarys.local", "x@localhost", "a@foo.test", "b@example.com", "c@bar.invalid"]) {
    assert.equal(isUndeliverableAddress(a), true, a);
  }
  for (const a of ["nurse@stmarys-drobo.org", "delivered@resend.dev", "doctor@gmail.com"]) {
    assert.equal(isUndeliverableAddress(a), false, a);
  }
});

test("only rate limits, server and network errors are retried", () => {
  assert.equal(classifyResendError({ statusCode: 429, name: "rate_limit_exceeded" }).retryable, true);
  assert.equal(classifyResendError({ statusCode: 500, name: "api_error" }).retryable, true);
  assert.equal(classifyResendError({ name: "concurrent_idempotent_requests", statusCode: 409 }).retryable, true);
  for (const [statusCode, name] of [[400, "validation_error"], [401, "authentication_error"], [403, "authorization_error"], [409, "invalid_idempotent_request"], [422, "unprocessable_entity"]]) {
    assert.equal(classifyResendError({ statusCode, name }).retryable, false, `${statusCode} ${name}`);
  }
});

test("retry schedule stays inside Resend's 24 h idempotency window", () => {
  const totalMinutes = RETRY_DELAYS_MIN.reduce((a, b) => a + b, 0);
  assert.ok(totalMinutes < 24 * 60);
  assert.equal(MAX_ATTEMPTS, RETRY_DELAYS_MIN.length + 1);
});
