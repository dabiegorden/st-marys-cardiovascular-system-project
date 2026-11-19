"use client";

import { ArrowDownRight, ArrowUpRight, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import type { Assessment, Feature, Metrics, RiskBandDef } from "@/lib/types";
import { pct, prob, resultLabel } from "@/lib/format";
import { RiskBadge, riskColorVar } from "@/components/common";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ProbabilityGauge({ probability, bands, threshold }: { probability: number; bands: RiskBandDef[]; threshold: number }) {
  return (
    <div aria-label={`Estimated probability ${prob(probability)}`} role="img">
      <div className="relative">
        <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
          {bands.map((b) => (
            <div
              key={b.name}
              className="h-full opacity-40"
              title={`${b.label}: ${pct(b.min, 0)}–${pct(b.max, 0)}`}
              style={{ width: `${(b.max - b.min) * 100}%`, background: riskColorVar(b.name) }}
            />
          ))}
        </div>
        <div
          className="absolute -top-1.5 h-6 w-1.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card"
          style={{ left: `${Math.min(99.5, Math.max(0.5, probability * 100))}%` }}
        />
      </div>
      <div className="relative mt-2 h-4 text-[11px] tabular-nums text-muted-foreground">
        <span className="absolute left-0">0%</span>
        {bands.slice(1).map((b) => (
          <span key={b.name} className="absolute -translate-x-1/2" style={{ left: `${b.min * 100}%` }}>
            {pct(b.min, 0)}
          </span>
        ))}
        <span className="absolute right-0">100%</span>
      </div>
      <p className="sr-only">Decision threshold {pct(threshold, 0)}</p>
    </div>
  );
}

function featureValue(f: Feature, v: number | null | undefined) {
  if (v === null || v === undefined) return "Not measured (imputed)";
  if (f.type === "category") return f.options?.find((o) => o.value === v)?.label ?? String(v);
  return `${v}${f.unit ? ` ${f.unit}` : ""}`;
}

export function AssessmentResult({
  assessment,
  features,
  bands,
  threshold,
  metrics,
  disclaimer,
  showInputs = false,
}: {
  assessment: Pick<Assessment, "prediction" | "probability" | "riskBand" | "warnings" | "explanation" | "inputFeatures" | "modelVersion">;
  features: Feature[];
  bands: RiskBandDef[];
  threshold: number;
  metrics: { internal: Metrics; external: (Metrics & { name: string })[] };
  disclaimer: string;
  showInputs?: boolean;
}) {
  const a = assessment;
  const ext = metrics.external[0];
  const positive = a.prediction === 1;

  return (
    <div className="space-y-6">
      <Card className="print-area">
        <CardHeader>
          <CardDescription>Model result</CardDescription>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-3xl">{resultLabel(a.prediction)}</CardTitle>
            <RiskBadge band={a.riskBand} className="text-sm" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <div className="text-sm text-muted-foreground">Estimated probability of cardiovascular disease</div>
              <div className="text-4xl font-semibold tabular-nums">{prob(a.probability)}</div>
            </div>
            <div className="text-xs text-muted-foreground">
              Classified as {positive ? "positive" : "negative"} at the {pct(threshold, 0)} threshold
            </div>
          </div>
          <div className="pt-6">
            <ProbabilityGauge probability={a.probability} bands={bands} threshold={threshold} />
          </div>

          {a.warnings.length > 0 && (
            <Alert>
              <TriangleAlert />
              <AlertTitle>Reliability notes</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-4">
                  {a.warnings.map((w) => (
                    <li key={w.field + w.code}>{w.message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="print-area">
          <CardHeader>
            <CardTitle className="text-base">What influenced this result</CardTitle>
            <CardDescription>
              Change in the estimated probability when each value is replaced by a typical value from the training data.
              This describes the model&apos;s behaviour, not cause and effect.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {a.explanation?.length ? (
              <ul className="divide-y">
                {a.explanation.map((e) => {
                  const up = e.effect > 0;
                  const Icon = up ? ArrowUpRight : ArrowDownRight;
                  return (
                    <li key={e.feature} className="flex items-start gap-3 py-2.5">
                      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{e.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {e.value} <span className="opacity-70">(typical: {e.reference})</span>
                        </div>
                      </div>
                      <div className="text-right text-sm tabular-nums">
                        <div className="font-medium">
                          {up ? "+" : "−"}
                          {Math.abs(e.effect * 100).toFixed(1)} pts
                        </div>
                        <div className="text-xs text-muted-foreground">{up ? "raises" : "lowers"} risk</div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                No single value changes the estimate by more than half a percentage point when set to a typical value.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="print-area">
          <CardHeader>
            <CardTitle className="text-base">How reliable is the model?</CardTitle>
            <CardDescription>Random Forest {a.modelVersion}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <MetricPair label="Sensitivity (external)" value={pct(ext?.recall)} hint="of patients with CVD were flagged" />
              <MetricPair label="Specificity (external)" value={pct(ext?.specificity)} hint="of patients without CVD were cleared" />
              <MetricPair label="Accuracy (external)" value={pct(ext?.accuracy)} hint={`n = ${ext?.n ?? "—"}`} />
              <MetricPair label="Accuracy (internal test)" value={pct(metrics.internal.accuracy)} hint={`n = ${metrics.internal.n ?? "—"}`} />
            </div>
            <p className="text-xs text-muted-foreground">
              External figures come from an independent dataset (Statlog/Cleveland/Hungary) and are the more realistic
              estimate for a new population. The model has not been validated on Saint Mary&apos;s patients.
            </p>
          </CardContent>
        </Card>
      </div>

      {showInputs && (
        <Card className="print-area">
          <CardHeader>
            <CardTitle className="text-base">Clinical inputs</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {features.map((f) => (
                <div key={f.name} className="flex justify-between gap-4 border-b py-1.5 text-sm">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="text-right font-medium">{featureValue(f, a.inputFeatures[f.name])}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      )}

      <Alert className="print-area border-primary/30 bg-accent/40">
        <ShieldAlert />
        <AlertTitle>Decision support only</AlertTitle>
        <AlertDescription>{disclaimer}</AlertDescription>
      </Alert>
    </div>
  );
}

function MetricPair({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-tile-gray p-3">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Info className="size-3" /> {label}
      </div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
