"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DecisionCurvePoint, ThresholdRow } from "@/lib/types";
import { pct } from "@/lib/format";

const axis = { stroke: "var(--muted-foreground)", fontSize: 12, tickLine: false, axisLine: false } as const;
const grid = { stroke: "var(--border)", vertical: false } as const;
const UNIT = [0, 0.2, 0.4, 0.6, 0.8, 1];

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 rounded" style={{ background: i.dashed ? "transparent" : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Box({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium">{title}</div>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 text-muted-foreground">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} />}
          {r.label}
          <span className="ml-auto pl-3 font-medium tabular-nums text-foreground">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Sensitivity and specificity across thresholds; marker at the selected threshold. */
export function ThresholdTradeoffChart({ rows, selected }: { rows: ThresholdRow[]; selected: number }) {
  return (
    <div>
      <Legend items={[{ label: "Sensitivity", color: "var(--series-1)" }, { label: "Specificity", color: "var(--series-2)" }]} />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={rows} margin={{ top: 8, right: 16, left: -8, bottom: 16 }}>
          <CartesianGrid {...grid} vertical />
          <XAxis type="number" dataKey="threshold" domain={[0, 1]} ticks={UNIT} {...axis} tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: "Decision threshold", position: "insideBottom", offset: -10, fontSize: 12, fill: "var(--muted-foreground)" }} />
          <YAxis domain={[0, 1]} ticks={UNIT} {...axis} tickFormatter={(v: number) => pct(v, 0)} />
          <ReferenceLine x={selected} stroke="var(--primary)" strokeDasharray="4 4" label={{ value: `${selected.toFixed(2)}`, position: "insideBottomRight", fontSize: 11, fill: "var(--primary)" }} />
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Box
                  title={`Threshold ${Number(payload[0].payload.threshold).toFixed(2)}`}
                  rows={[
                    { label: "Sensitivity", value: pct(payload[0].payload.sensitivity), color: "var(--series-1)" },
                    { label: "Specificity", value: pct(payload[0].payload.specificity), color: "var(--series-2)" },
                    { label: "PPV", value: pct(payload[0].payload.ppv) },
                    { label: "NPV", value: pct(payload[0].payload.npv) },
                    { label: "Flagged as CVD", value: pct(payload[0].payload.flagged_rate) },
                  ]}
                />
              ) : null
            }
          />
          <Line dataKey="sensitivity" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="specificity" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Decision-curve analysis: net benefit of the model vs treat-all / treat-none. */
export function DecisionCurveChart({ points, selected }: { points: DecisionCurvePoint[]; selected?: number }) {
  // Standard DCA presentation: clip strongly negative net benefit just below zero
  const FLOOR = -0.05;
  const data = points.map((p) => ({ ...p, treat_all: Math.max(p.treat_all, FLOOR), model: p.model === null ? null : Math.max(p.model, FLOOR) }));
  const top = Math.max(0.1, Math.ceil(Math.max(...points.map((p) => Math.max(p.model ?? 0, p.treat_all))) * 10) / 10);
  const ticks = Array.from({ length: Math.round(top / 0.1) + 1 }, (_, i) => +(i * 0.1).toFixed(1));
  return (
    <div>
      <Legend
        items={[
          { label: "Model", color: "var(--series-1)" },
          { label: "Treat all", color: "var(--muted-foreground)", dashed: true },
          { label: "Treat none", color: "var(--border)" },
        ]}
      />
      <ResponsiveContainer width="100%" height={240}>
        <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 16 }}>
          <CartesianGrid {...grid} vertical />
          <XAxis type="number" dataKey="threshold" domain={[0, 1]} ticks={UNIT} {...axis} tickFormatter={(v: number) => v.toFixed(1)}
            label={{ value: "Threshold probability", position: "insideBottom", offset: -10, fontSize: 12, fill: "var(--muted-foreground)" }} />
          <YAxis domain={[FLOOR, top]} ticks={ticks} allowDataOverflow {...axis} tickFormatter={(v: number) => v.toFixed(1)} />
          <ReferenceLine y={0} stroke="var(--border)" strokeWidth={2} />
          {selected !== undefined && <ReferenceLine x={selected} stroke="var(--primary)" strokeDasharray="4 4" />}
          <Tooltip
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Box
                  title={`Threshold ${Number(payload[0].payload.threshold).toFixed(2)}`}
                  rows={[
                    { label: "Model", value: Number(payload[0].payload.model).toFixed(3), color: "var(--series-1)" },
                    { label: "Treat all", value: Number(payload[0].payload.treat_all).toFixed(3) },
                    { label: "Treat none", value: "0.000" },
                  ]}
                />
              ) : null
            }
          />
          <Line dataKey="treat_all" stroke="var(--muted-foreground)" strokeDasharray="5 4" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="model" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Training vs recent distribution for one input (drift monitoring). */
export function DistributionCompareChart({ bins }: { bins: { label: string; training: number; recent: number }[] }) {
  return (
    <div>
      <Legend items={[{ label: "Training data", color: "var(--series-1)" }, { label: "Recent patients", color: "var(--series-2)" }]} />
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={bins} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barGap={2}>
          <CartesianGrid {...grid} />
          <XAxis dataKey="label" {...axis} tick={{ fontSize: 10 }} interval={0} angle={bins.length > 6 ? -30 : 0} textAnchor={bins.length > 6 ? "end" : "middle"} height={bins.length > 6 ? 48 : 24} />
          <YAxis {...axis} tickFormatter={(v: number) => pct(v, 0)} />
          <Tooltip
            cursor={{ fill: "var(--accent)", opacity: 0.4 }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Box
                  title={String(payload[0].payload.label)}
                  rows={[
                    { label: "Training", value: pct(payload[0].payload.training), color: "var(--series-1)" },
                    { label: "Recent", value: pct(payload[0].payload.recent), color: "var(--series-2)" },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="training" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
          <Bar dataKey="recent" fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
