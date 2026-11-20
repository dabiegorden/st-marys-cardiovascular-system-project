/**
 * services/insights.js – local validation, data-drift monitoring, usability study
 */

import { and, asc, count, desc, eq, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "../db/db.js";
import { assessments, modelVersions, susResponses, users } from "../db/schema.js";
import { config } from "../config.js";
import { getActiveModel } from "../ml/registry.js";
import { binProportions, classificationReport, decisionCurve, describe, psi, psiLevel, susInterpretation } from "../ml/metrics.js";

/* ------------------------------------------------------------------ */
/* Local validation (outcomes recorded at Saint Mary's)                 */
/* ------------------------------------------------------------------ */

export async function localValidation({ modelVersionId } = {}) {
  const where = and(isNotNull(assessments.outcome), modelVersionId ? eq(assessments.modelVersionId, modelVersionId) : undefined);
  const rows = await db
    .select({
      prediction: assessments.prediction,
      probability: assessments.probability,
      outcome: assessments.outcome,
      riskBand: assessments.riskBand,
      modelVersion: modelVersions.version,
    })
    .from(assessments)
    .innerJoin(modelVersions, eq(assessments.modelVersionId, modelVersions.id))
    .where(where);

  const [{ total }] = await db.select({ total: count() }).from(assessments);
  const toRow = (r) => ({ actual: r.outcome === "cvd_confirmed" ? 1 : 0, predicted: r.prediction, probability: r.probability });

  const byVersion = {};
  for (const r of rows) (byVersion[r.modelVersion] ??= []).push(toRow(r));

  const byBand = ["low", "moderate", "high"].map((band) => {
    const b = rows.filter((r) => r.riskBand === band);
    const confirmed = b.filter((r) => r.outcome === "cvd_confirmed").length;
    return { riskBand: band, n: b.length, confirmed, observedRate: b.length ? confirmed / b.length : null };
  });

  const all = rows.map(toRow);
  return {
    coverage: { withOutcome: rows.length, totalAssessments: total },
    overall: classificationReport(all),
    byVersion: Object.entries(byVersion).map(([version, r]) => ({ version, ...classificationReport(r) })),
    byRiskBand: byBand,
    decisionCurve: all.length >= 20 ? decisionCurve(all) : [],
    minimumForConclusions: 100,
  };
}

/* ------------------------------------------------------------------ */
/* Data drift (population stability index vs training distribution)    */
/* ------------------------------------------------------------------ */

export async function driftReport(windowDays = config.monitoring.driftWindowDays) {
  const active = getActiveModel();
  if (!active) return null;
  const m = active.model.manifest;
  const ref = m.feature_distribution;
  const since = new Date(Date.now() - windowDays * 864e5);

  const rows = await db
    .select({ inputFeatures: assessments.inputFeatures, probability: assessments.probability, prediction: assessments.prediction })
    .from(assessments)
    .where(gte(assessments.createdAt, since));

  const n = rows.length;
  const minimum = 30;
  const base = {
    modelVersion: m.version,
    windowDays,
    n,
    minimum,
    reliable: n >= minimum,
    available: Boolean(ref),
  };
  if (!ref) return { ...base, features: [], prediction: null, message: "This model version has no stored training distribution. Run model_training/augment_manifest.py." };

  const features = m.features.map((f) => {
    const values = rows.map((r) => r.inputFeatures?.[f.name]);
    const bins = binProportions(ref[f.name], values);
    const value = n ? psi(bins.expected, bins.actual) : null;
    const present = values.filter((v) => v !== null && v !== undefined).map(Number);
    const optionLabel = (k) => f.options?.find((o) => String(o.value) === k)?.label ?? k;
    return {
      feature: f.name,
      label: f.label,
      type: f.type,
      psi: value,
      level: n >= minimum ? psiLevel(value) : "insufficient",
      trainingMean: ref[f.name].mean ?? null,
      recentMean: f.type === "number" && present.length ? present.reduce((a, b) => a + b, 0) / present.length : null,
      missingRate: n ? 1 - present.length / n : null,
      bins: bins.labels.map((label, i) => ({ label: f.type === "category" ? optionLabel(label) : label, training: bins.expected[i], recent: bins.actual[i] })),
    };
  });

  const trainingPrevalence = m.training_data?.data_report?.positive_rate ?? null;
  const positiveRate = n ? rows.filter((r) => r.prediction === 1).length / n : null;
  const meanProbability = n ? rows.reduce((s, r) => s + r.probability, 0) / n : null;

  features.sort((a, b) => (b.psi ?? -1) - (a.psi ?? -1));
  const worst = features.find((f) => f.psi !== null);
  return {
    ...base,
    overall: n >= minimum ? psiLevel(worst?.psi ?? 0) : "insufficient",
    features,
    prediction: { positiveRate, meanProbability, trainingPrevalence },
  };
}

/* ------------------------------------------------------------------ */
/* Usability study (SUS + task timing)                                  */
/* ------------------------------------------------------------------ */

export const SUS_ITEMS = [
  "I think that I would like to use this system frequently.",
  "I found the system unnecessarily complex.",
  "I thought the system was easy to use.",
  "I think that I would need the support of a technical person to be able to use this system.",
  "I found the various functions in this system were well integrated.",
  "I thought there was too much inconsistency in this system.",
  "I would imagine that most people would learn to use this system very quickly.",
  "I found the system very cumbersome to use.",
  "I felt very confident using the system.",
  "I needed to learn a lot of things before I could get going with this system.",
];

export async function susStatus(user) {
  const [[{ assessmentsDone }], [existing], [u]] = await Promise.all([
    db.select({ assessmentsDone: count() }).from(assessments).where(eq(assessments.userId, user.id)),
    db.select({ id: susResponses.id, createdAt: susResponses.createdAt }).from(susResponses).where(eq(susResponses.userId, user.id)).limit(1),
    db.select({ dismissed: users.susDismissedAt }).from(users).where(eq(users.id, user.id)),
  ]);
  const snoozed = u?.dismissed && Date.now() - new Date(u.dismissed).getTime() < 3 * 864e5;
  return {
    completed: Boolean(existing),
    assessmentsDone,
    promptAfter: config.usability.promptAfter,
    shouldPrompt: !existing && assessmentsDone >= config.usability.promptAfter && !snoozed,
    items: SUS_ITEMS,
  };
}

export async function usabilityReport() {
  const responses = await db
    .select({
      id: susResponses.id,
      role: susResponses.role,
      answers: susResponses.answers,
      score: susResponses.score,
      comment: susResponses.comment,
      assessmentCount: susResponses.assessmentCount,
      createdAt: susResponses.createdAt,
      userName: users.name,
    })
    .from(susResponses)
    .leftJoin(users, eq(susResponses.userId, users.id))
    .orderBy(desc(susResponses.createdAt));

  const scores = responses.map((r) => r.score);
  const overall = describe(scores);
  const itemMeans = SUS_ITEMS.map((text, i) => {
    const vals = responses.map((r) => r.answers[i]);
    return { item: i + 1, text, positive: i % 2 === 0, mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null };
  });
  const byRole = ["admin", "clinician"].map((role) => ({ role, ...describe(responses.filter((r) => r.role === role).map((r) => r.score)) }));

  // Task timing: time to complete the assessment form, by the user's n-th assessment
  const timed = await db
    .select({
      userId: assessments.userId,
      ms: assessments.formDurationMs,
      createdAt: assessments.createdAt,
      rank: sql`row_number() over (partition by ${assessments.userId} order by ${assessments.createdAt})`.mapWith(Number),
    })
    .from(assessments)
    .where(isNotNull(assessments.formDurationMs))
    .orderBy(asc(assessments.createdAt));
  const seconds = timed.map((t) => t.ms / 1000).filter((s) => s > 0 && s < 3600);
  const buckets = [
    { label: "1st–3rd", from: 1, to: 3 },
    { label: "4th–10th", from: 4, to: 10 },
    { label: "11th+", from: 11, to: Infinity },
  ].map((b) => ({ label: b.label, ...describe(timed.filter((t) => t.rank >= b.from && t.rank <= b.to).map((t) => t.ms / 1000)) }));

  return {
    sus: { ...overall, interpretation: susInterpretation(overall.mean), byRole, items: itemMeans, responses },
    taskTime: { overall: describe(seconds), byExperience: buckets },
  };
}
