"use client";

/**
 * Charts follow one system: thin marks, 4px rounded data-ends, recessive
 * grid/axes, one y-axis, hover tooltips on every chart, legends only for
 * two or more series, text in text tokens (never in series colour).
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import type { RiskBand } from "@/lib/types";
import { RISK_LABEL, pct } from "@/lib/format";
import { riskColorVar } from "@/components/common";

const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false } as const;
const UNIT_TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];
const grid = { stroke: "var(--border)", strokeDasharray: "0", vertical: false } as const;

function TooltipBox({ title, rows }: { title?: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      {title && <div className="mb-1 font-medium text-foreground">{title}</div>}
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted-foreground">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          <span>{r.label}</span>
          <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------- Daily assessments (single series) ---------- */
export function DailyAssessmentsChart({ data }: { data: { day: string; total: number; positive: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="day" {...axis} tickFormatter={(d: string) => d.slice(5)} minTickGap={16} />
        <YAxis {...axis} allowDecimals={false} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={String(payload[0].payload.day)}
                rows={[
                  { label: "Assessments", value: String(payload[0].payload.total) },
                  { label: "CVD likely", value: String(payload[0].payload.positive) },
                ]}
              />
            ) : null
          }
        />
        <Bar dataKey="total" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Risk distribution: labelled meters, not colour alone ---------- */
export function RiskDistribution({ data }: { data: { riskBand: RiskBand; total: number }[] }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  const bands: RiskBand[] = ["high", "moderate", "low"];
  return (
    <div className="space-y-4">
      {bands.map((b) => {
        const n = data.find((d) => d.riskBand === b)?.total ?? 0;
        const share = total ? n / total : 0;
        return (
          <div key={b} className="space-y-1.5">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium">{RISK_LABEL[b]}</span>
              <span className="tabular-nums text-muted-foreground">
                {n} · {pct(share, 0)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-muted" title={`${RISK_LABEL[b]}: ${n} (${pct(share, 0)})`}>
              <div className="h-2 rounded-full" style={{ width: `${share * 100}%`, background: riskColorVar(b) }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- ROC curve (single series + chance diagonal) ---------- */
export function RocChart({ points, auc }: { points: { fpr: number; tpr: number }[]; auc: number | null }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 8, right: 16, left: -8, bottom: 16 }}>
        <CartesianGrid {...grid} vertical />
        <XAxis
          type="number"
          dataKey="fpr"
          domain={[0, 1]}
          ticks={UNIT_TICKS}
          {...axis}
          tickFormatter={(v: number) => v.toFixed(1)}
          label={{ value: "False positive rate (1 − specificity)", position: "insideBottom", offset: -10, fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis type="number" domain={[0, 1]} ticks={UNIT_TICKS} {...axis} tickFormatter={(v: number) => v.toFixed(1)} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={`AUC ${auc?.toFixed(3) ?? "—"}`}
                rows={[
                  { label: "Sensitivity", value: pct(payload[0].payload.tpr) },
                  { label: "False positive rate", value: pct(payload[0].payload.fpr) },
                ]}
              />
            ) : null
          }
        />
        <Line type="linear" dataKey="tpr" stroke="var(--primary)" strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------- Calibration (single series + perfect-calibration diagonal) ---------- */
export function CalibrationChart({ points }: { points: { predicted: number; observed: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={points} margin={{ top: 8, right: 16, left: -8, bottom: 16 }}>
        <CartesianGrid {...grid} vertical />
        <XAxis
          type="number"
          dataKey="predicted"
          domain={[0, 1]}
          ticks={UNIT_TICKS}
          {...axis}
          tickFormatter={(v: number) => v.toFixed(1)}
          label={{ value: "Predicted probability", position: "insideBottom", offset: -10, fontSize: 12, fill: "var(--muted-foreground)" }}
        />
        <YAxis type="number" domain={[0, 1]} ticks={UNIT_TICKS} {...axis} tickFormatter={(v: number) => v.toFixed(1)} />
        <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 1, y: 1 }]} stroke="var(--muted-foreground)" strokeDasharray="4 4" strokeOpacity={0.6} />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                rows={[
                  { label: "Predicted", value: pct(payload[0].payload.predicted) },
                  { label: "Observed", value: pct(payload[0].payload.observed) },
                ]}
              />
            ) : null
          }
        />
        <Line type="linear" dataKey="observed" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/* ---------- Feature importance (single series, horizontal) ---------- */
export function FeatureImportanceChart({ data }: { data: { label: string; value: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 30)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }}>
        <CartesianGrid {...grid} vertical horizontal={false} />
        <XAxis type="number" {...axis} tickFormatter={(v: number) => pct(v, 0)} />
        <YAxis type="category" dataKey="label" {...axis} width={190} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox title={String(payload[0].payload.label)} rows={[{ label: "Importance", value: pct(payload[0].payload.value) }]} />
            ) : null
          }
        />
        <Bar dataKey="value" fill="var(--primary)" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ---------- Internal vs external (two series → legend) ---------- */
export function InternalExternalChart({
  data,
  metricLabel,
}: {
  data: { label: string; internal: number | null; external: number | null }[];
  metricLabel: string;
}) {
  return (
    <div>
      <div className="mb-2 flex gap-4 text-xs text-muted-foreground" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-series-1" /> Internal test</span>
        <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-series-2" /> External test</span>
      </div>
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }} barGap={2}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" {...axis} interval={0} tick={{ fontSize: 11 }} height={48} tickFormatter={(s: string) => s.replace(/ \(.*\)/, "")} />
        <YAxis {...axis} domain={[0, 1]} ticks={UNIT_TICKS} tickFormatter={(v: number) => v.toFixed(1)} />
        <Tooltip
          cursor={{ fill: "var(--accent)", opacity: 0.5 }}
          content={({ active, payload }) =>
            active && payload?.length ? (
              <TooltipBox
                title={`${payload[0].payload.label} · ${metricLabel}`}
                rows={[
                  { label: "Internal test", value: payload[0].payload.internal?.toFixed(3) ?? "—", color: "var(--series-1)" },
                  { label: "External test", value: payload[0].payload.external?.toFixed(3) ?? "—", color: "var(--series-2)" },
                ]}
              />
            ) : null
          }
        />
        <Bar name="Internal test" dataKey="internal" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={22} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
        <Bar name="External test" dataKey="external" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={22} stroke="var(--card)" strokeWidth={2} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}

/* ---------- Confusion matrix (numbers always visible) ---------- */
export function ConfusionMatrix({ cm }: { cm: { tn: number; fp: number; fn: number; tp: number } }) {
  const total = cm.tn + cm.fp + cm.fn + cm.tp;
  const cell = (n: number, label: string, correct: boolean) => (
    <div
      className={`flex flex-col items-center justify-center rounded-md border p-3 text-center ${correct ? "bg-accent" : "bg-muted/60"}`}
    >
      <span className="text-2xl font-semibold tabular-nums">{n}</span>
      <span className="text-xs text-muted-foreground">
        {label} · {pct(total ? n / total : 0)}
      </span>
    </div>
  );
  return (
    <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-sm">
      <div />
      <div className="text-center text-xs font-medium text-muted-foreground">Predicted: no CVD</div>
      <div className="text-center text-xs font-medium text-muted-foreground">Predicted: CVD</div>
      <div className="flex items-center pr-2 text-xs font-medium text-muted-foreground">Actual: no CVD</div>
      {cell(cm.tn, "True negative", true)}
      {cell(cm.fp, "False positive", false)}
      <div className="flex items-center pr-2 text-xs font-medium text-muted-foreground">Actual: CVD</div>
      {cell(cm.fn, "False negative", false)}
      {cell(cm.tp, "True positive", true)}
    </div>
  );
}
