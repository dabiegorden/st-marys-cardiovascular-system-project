/**
 * Tests for follow-up rules, local-validation statistics, drift (PSI),
 * usability scoring and SMS helpers – pure functions, no network or database.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { binProportions, classificationReport, decisionCurve, describe, psi, psiLevel, rocAuc, susInterpretation, susScore, wilson } from "../src/ml/metrics.js";
import { validateTransition } from "../src/services/case-rules.js";
import {
  classifyArkeselError,
  escalationSms,
  highRiskSms,
  normalizeGhanaPhone,
  smsSegments,
  toGsm,
} from "../src/notifications/sms-templates.js";
import { loadSession, requireAuth, setRequireAdmin2fa } from "../src/middleware/auth.js";

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/* ---------- statistics ---------- */
test("Wilson interval matches the textbook value", () => {
  const w = wilson(8, 10); // p = 0.8 → 95 % CI ≈ 0.490–0.943
  close(w.value, 0.8);
  close(w.low, 0.4902);
  close(w.high, 0.9433);
  assert.equal(wilson(0, 0).value, null);
});

test("ROC-AUC via Mann-Whitney", () => {
  assert.equal(rocAuc([1, 1, 0, 0], [0.9, 0.8, 0.3, 0.2]), 1);
  assert.equal(rocAuc([1, 0], [0.5, 0.5]), 0.5);
  assert.equal(rocAuc([1, 1], [0.9, 0.8]), null);
});

test("classification report counts the confusion matrix correctly", () => {
  const rows = [
    { actual: 1, predicted: 1, probability: 0.9 },
    { actual: 1, predicted: 0, probability: 0.4 },
    { actual: 0, predicted: 0, probability: 0.1 },
    { actual: 0, predicted: 1, probability: 0.7 },
    { actual: 0, predicted: 0, probability: 0.2 },
  ];
  const r = classificationReport(rows);
  assert.deepEqual(r.confusion_matrix, { tn: 2, fp: 1, fn: 1, tp: 1 });
  close(r.sensitivity.value, 0.5);
  close(r.specificity.value, 2 / 3);
  close(r.accuracy.value, 0.6);
});

test("decision curve: treat-all equals prevalence at threshold → 0", () => {
  const rows = [{ actual: 1, probability: 0.9 }, { actual: 0, probability: 0.1 }];
  const dc = decisionCurve(rows, [0.5]);
  close(dc[0].model, 0.5); // 1 TP of 2, no FP
  close(dc[0].treat_all, 0); // prevalence 0.5 − 0.5·1
});

test("PSI is ~0 for identical distributions and grows with shift", () => {
  close(psi([0.5, 0.5], [0.5, 0.5]), 0);
  assert.ok(psi([0.5, 0.5], [0.9, 0.1]) > 0.25);
  assert.equal(psiLevel(0.05), "stable");
  assert.equal(psiLevel(0.2), "moderate");
  assert.equal(psiLevel(0.4), "significant");
});

test("bin proportions use the training cut points", () => {
  const ref = { type: "number", cuts: [10, 20], proportions: [0.3, 0.4, 0.3] };
  const b = binProportions(ref, [5, 15, 15, 25, null]);
  assert.deepEqual(b.actual, [0.25, 0.5, 0.25]);
  const cat = binProportions({ type: "category", proportions: { 0: 0.5, 1: 0.5 } }, [0, 0, 1, 1]);
  assert.deepEqual(cat.actual, [0.5, 0.5]);
});

test("SUS scoring follows Brooke (1996)", () => {
  assert.equal(susScore([5, 1, 5, 1, 5, 1, 5, 1, 5, 1]), 100);
  assert.equal(susScore([1, 5, 1, 5, 1, 5, 1, 5, 1, 5]), 0);
  assert.equal(susScore([3, 3, 3, 3, 3, 3, 3, 3, 3, 3]), 50);
  assert.throws(() => susScore([1, 2, 3]));
  assert.equal(susInterpretation(68).acceptable, true);
  assert.equal(susInterpretation(50).grade, "F");
  assert.equal(susInterpretation(85).adjective, "Excellent");
});

test("describe() gives median and quartiles", () => {
  const d = describe([1, 2, 3, 4, 5]);
  assert.equal(d.median, 3);
  assert.equal(d.q1, 2);
  assert.equal(d.q3, 4);
});

/* ---------- follow-up workflow ---------- */
test("case transitions are enforced", () => {
  assert.equal(validateTransition("acknowledge", "open"), null);
  assert.match(validateTransition("acknowledge", "closed"), /Cannot acknowledge/);
  assert.match(validateTransition("close", "open", { note: "" }), /add a note/);
  assert.equal(validateTransition("close", "referred", { note: "Seen by cardiology" }), null);
  assert.match(validateTransition("reopen", "closed", { note: "x", role: "clinician" }), /administrators/);
  assert.equal(validateTransition("reopen", "closed", { note: "x", role: "admin" }), null);
  assert.match(validateTransition("fly", "open"), /Unknown/);
});

/* ---------- SMS ---------- */
test("Ghana phone numbers are normalised to 233XXXXXXXXX", () => {
  assert.equal(normalizeGhanaPhone("024 123 4567"), "233241234567");
  assert.equal(normalizeGhanaPhone("+233 24 123 4567"), "233241234567");
  assert.equal(normalizeGhanaPhone("00233241234567"), "233241234567");
  assert.equal(normalizeGhanaPhone("241234567"), "233241234567");
  assert.equal(normalizeGhanaPhone("12345"), null);
  assert.equal(normalizeGhanaPhone(null), null);
});

test("SMS text is GSM-7 safe, masked, single segment and has no clinical values", () => {
  const sms = highRiskSms({
    assessment: { id: "0f8e7d6c-5b4a-4321-9abc-def012345678", probability: 0.874 },
    hospitalNumber: "SMH/2026/00412",
    assessorName: "Dr Ama’s team",
    appUrl: "https://cvd.stmarys.org",
    showHospitalNumber: false,
  });
  assert.ok(/^[\x20-\x7E\n]*$/.test(sms), "only GSM-safe characters");
  assert.ok(sms.includes("***0412") && !sms.includes("SMH/2026/00412"));
  assert.ok(sms.includes("87%"));
  assert.ok(!/cholesterol|blood pressure/i.test(sms));
  assert.ok(smsSegments(sms) <= 2);
  assert.equal(toGsm("a – b • c"), "a - b * c");
  assert.match(escalationSms({ assessment: { id: "x", probability: 0.9 }, hospitalNumber: "AB1234", hours: 4, appUrl: "https://a.b" }), /not acknowledged after 4h/);
});

test("Arkesel errors: only 429, 5xx and network failures are retried", () => {
  for (const s of [401, 402, 403, 422]) assert.equal(classifyArkeselError(s, {}).retryable, false, s);
  for (const s of [429, 500, 503, 0]) assert.equal(classifyArkeselError(s, {}).retryable, true, s);
});

/* ---------- admin 2FA enforcement ---------- */
test("admins without 2FA are held at setup when enforcement is on", async () => {
  const users = {
    admin: { id: "a", role: "admin", twoFactorEnabled: false },
    admin2fa: { id: "b", role: "admin", twoFactorEnabled: true },
    clinician: { id: "c", role: "clinician", twoFactorEnabled: false },
  };
  const app = express();
  app.use(loadSession(async (req) => ({ user: users[req.get("x-u")] })));
  app.get("/api/me", requireAuth, (_q, r) => r.json({ ok: 1 }));
  app.get("/api/assessments", requireAuth, (_q, r) => r.json({ ok: 1 }));

  setRequireAdmin2fa(true);
  const blocked = await request(app).get("/api/assessments").set("x-u", "admin");
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.code, "TWO_FACTOR_SETUP_REQUIRED");
  assert.equal((await request(app).get("/api/me").set("x-u", "admin")).status, 200);
  assert.equal((await request(app).get("/api/assessments").set("x-u", "admin2fa")).status, 200);
  assert.equal((await request(app).get("/api/assessments").set("x-u", "clinician")).status, 200);
  setRequireAdmin2fa(false);
  assert.equal((await request(app).get("/api/assessments").set("x-u", "admin")).status, 200);
});
