import type { RiskBand } from "./types";

export const pct = (v: number | null | undefined, digits = 1) =>
  v == null || Number.isNaN(v) ? "—" : `${(v * 100).toFixed(digits)}%`;

/** Probability for display: avoids implying certainty at the extremes. */
export const prob = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "—" : v >= 0.995 ? "> 99%" : v <= 0.005 ? "< 1%" : `${(v * 100).toFixed(1)}%`;

export const num = (v: number | null | undefined, digits = 3) =>
  v == null || Number.isNaN(v) ? "—" : v.toFixed(digits);

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
    : "—";

export const date = (iso: string | null | undefined) =>
  iso ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(iso)) : "—";

export const RISK_LABEL: Record<RiskBand, string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  high: "High risk",
};

export const resultLabel = (prediction: 0 | 1) => (prediction === 1 ? "CVD likely" : "CVD unlikely");
