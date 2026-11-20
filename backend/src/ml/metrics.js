/**
 * ml/metrics.js – statistics used for local validation, monitoring and usability
 * (pure functions, unit-tested)
 */

/** Wilson score interval for a binomial proportion (95 % by default). */
export function wilson(successes, n, z = 1.96) {
  if (!n) return { value: null, low: null, high: null, n: 0 };
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { value: p, low: Math.max(0, centre - half), high: Math.min(1, centre + half), n };
}

/** ROC-AUC via the Mann–Whitney U statistic (ties count ½). */
export function rocAuc(labels, probs) {
  const pos = [];
  const neg = [];
  labels.forEach((y, i) => (y ? pos : neg).push(probs[i]));
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

/**
 * Classification metrics with confidence intervals.
 * @param {{ actual: 0|1, predicted: 0|1, probability: number }[]} rows
 */
export function classificationReport(rows) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (const r of rows) {
    if (r.predicted && r.actual) tp++;
    else if (r.predicted && !r.actual) fp++;
    else if (!r.predicted && !r.actual) tn++;
    else fn++;
  }
  const n = rows.length;
  const brier = n ? rows.reduce((s, r) => s + (r.probability - r.actual) ** 2, 0) / n : null;
  const sens = wilson(tp, tp + fn);
  const spec = wilson(tn, tn + fp);
  const ppv = wilson(tp, tp + fp);
  const npv = wilson(tn, tn + fn);
  const f1 = tp ? (2 * tp) / (2 * tp + fp + fn) : 0;
  return {
    n,
    positives: tp + fn,
    accuracy: wilson(tp + tn, n),
    sensitivity: sens,
    specificity: spec,
    ppv,
    npv,
    f1: n ? f1 : null,
    roc_auc: rocAuc(rows.map((r) => r.actual), rows.map((r) => r.probability)),
    brier,
    confusion_matrix: { tn, fp, fn, tp },
  };
}

/** Decision-curve net benefit for the model vs treat-all. */
export function decisionCurve(rows, thresholds = Array.from({ length: 49 }, (_, i) => +(0.02 + i * 0.02).toFixed(2))) {
  const n = rows.length;
  if (!n) return [];
  const prevalence = rows.filter((r) => r.actual).length / n;
  return thresholds.map((t) => {
    let tp = 0, fp = 0;
    for (const r of rows) {
      if (r.probability >= t) r.actual ? tp++ : fp++;
    }
    const w = t / (1 - t);
    return { threshold: t, model: tp / n - (fp / n) * w, treat_all: prevalence - (1 - prevalence) * w, treat_none: 0 };
  });
}

/* ------------------------------------------------------------------ */
/* Drift – population stability index                                   */
/* ------------------------------------------------------------------ */

const EPS = 1e-4;

/** PSI = Σ (actual − expected) · ln(actual / expected) */
export function psi(expected, actual) {
  let total = 0;
  for (let i = 0; i < expected.length; i++) {
    const e = Math.max(expected[i], EPS);
    const a = Math.max(actual[i] ?? 0, EPS);
    total += (a - e) * Math.log(a / e);
  }
  return total;
}

export const psiLevel = (v) => (v === null ? "insufficient" : v < 0.1 ? "stable" : v < 0.25 ? "moderate" : "significant");

/** Proportions of `values` in the reference bins of one feature. */
export function binProportions(ref, values) {
  const vals = values.filter((v) => v !== null && v !== undefined && Number.isFinite(Number(v))).map(Number);
  if (ref.type === "category") {
    const keys = Object.keys(ref.proportions);
    const counts = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const v of vals) {
      const k = String(Math.round(v));
      if (k in counts) counts[k]++;
    }
    const total = Math.max(vals.length, 1);
    return { expected: keys.map((k) => ref.proportions[k]), actual: keys.map((k) => counts[k] / total), labels: keys };
  }
  const counts = new Array(ref.cuts.length + 1).fill(0);
  for (const v of vals) counts[ref.cuts.filter((c) => v >= c).length]++;
  const total = Math.max(vals.length, 1);
  const labels = counts.map((_, i) =>
    i === 0 ? `< ${ref.cuts[0]}` : i === ref.cuts.length ? `≥ ${ref.cuts.at(-1)}` : `${ref.cuts[i - 1]}–${ref.cuts[i]}`,
  );
  return { expected: ref.proportions, actual: counts.map((c) => c / total), labels };
}

/* ------------------------------------------------------------------ */
/* Usability – System Usability Scale (Brooke, 1996)                   */
/* ------------------------------------------------------------------ */

/** 10 answers on a 1–5 scale → score 0–100. Odd items positive, even items negative. */
export function susScore(answers) {
  if (!Array.isArray(answers) || answers.length !== 10 || answers.some((a) => !Number.isInteger(a) || a < 1 || a > 5)) {
    throw new Error("SUS needs 10 answers between 1 and 5.");
  }
  const sum = answers.reduce((s, a, i) => s + (i % 2 === 0 ? a - 1 : 5 - a), 0);
  return sum * 2.5;
}

/** Adjective rating and grade (Bangor, Kortum & Miller 2009; Sauro & Lewis curved grading scale). */
export function susInterpretation(score) {
  if (score === null || score === undefined) return null;
  const adjective =
    score >= 85.6 ? "Best imaginable" : score >= 72.6 ? "Excellent" : score >= 52.1 ? "Good" : score >= 39.2 ? "OK" : score >= 25.1 ? "Poor" : "Worst imaginable";
  const grade = score >= 80.8 ? "A" : score >= 74.1 ? "B" : score >= 68 ? "C" : score >= 51.7 ? "D" : "F";
  return { adjective, grade, acceptable: score >= 68 };
}

export function describe(values) {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return { n: 0, mean: null, sd: null, median: null, q1: null, q3: null };
  const q = (p) => {
    const i = (v.length - 1) * p;
    const lo = Math.floor(i);
    return v[lo] + (v[Math.ceil(i)] - v[lo]) * (i - lo);
  };
  const mean = v.reduce((a, b) => a + b, 0) / v.length;
  const sd = v.length > 1 ? Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (v.length - 1)) : 0;
  return { n: v.length, mean, sd, median: q(0.5), q1: q(0.25), q3: q(0.75) };
}
