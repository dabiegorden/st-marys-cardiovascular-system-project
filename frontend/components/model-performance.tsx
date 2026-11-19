"use client";

import { useState } from "react";
import { Info } from "lucide-react";
import type { Manifest, Metrics } from "@/lib/types";
import { num, pct } from "@/lib/format";
import { CalibrationChart, ConfusionMatrix, FeatureImportanceChart, InternalExternalChart, RocChart } from "@/components/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const METRICS: { key: keyof Metrics; label: string; help: string }[] = [
  { key: "accuracy", label: "Accuracy", help: "Share of all predictions that were correct." },
  { key: "precision", label: "Precision", help: "Of patients flagged as CVD, the share who had CVD." },
  { key: "recall", label: "Sensitivity (recall)", help: "Of patients with CVD, the share the model flagged." },
  { key: "specificity", label: "Specificity", help: "Of patients without CVD, the share the model cleared." },
  { key: "f1", label: "F1-score", help: "Harmonic mean of precision and recall." },
  { key: "roc_auc", label: "ROC-AUC", help: "Ability to rank CVD above non-CVD patients (0.5 = chance, 1 = perfect)." },
];

function MetricTiles({ m }: { m: Metrics }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {METRICS.map(({ key, label, help }) => (
        <div key={key} className="rounded-xl bg-tile-gray p-4" title={help}>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {label} <Info className="size-3" />
          </div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">
            {key === "roc_auc" ? num(m[key] as number) : pct(m[key] as number)}
          </div>
        </div>
      ))}
    </div>
  );
}

function EvaluationPanel({ m, n, description }: { m: Metrics; n?: number; description: string }) {
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {description} {n !== undefined && <>· n = {n}</>}
        {m.brier !== undefined && <> · Brier score {num(m.brier)}</>}
      </p>
      <MetricTiles m={m} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Confusion matrix</CardTitle>
            <CardDescription>Threshold {pct(0.5, 0)}</CardDescription>
          </CardHeader>
          <CardContent>{m.confusion_matrix && <ConfusionMatrix cm={m.confusion_matrix} />}</CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ROC curve</CardTitle>
            <CardDescription>AUC {num(m.roc_auc)} · dashed line = chance</CardDescription>
          </CardHeader>
          <CardContent>{m.roc_curve && <RocChart points={m.roc_curve} auc={m.roc_auc} />}</CardContent>
        </Card>
        {m.calibration && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Calibration</CardTitle>
              <CardDescription>
                Observed CVD rate per bin of predicted probability. Points on the dashed diagonal mean the probabilities can be
                taken at face value.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <CalibrationChart points={m.calibration} />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

export function ModelPerformance({ manifest }: { manifest: Manifest }) {
  const ev = manifest.evaluation;
  const ext = ev.external[0];
  const [metric, setMetric] = useState<"roc_auc" | "accuracy" | "recall" | "specificity" | "f1">("accuracy");
  const metricLabel = METRICS.find((x) => x.key === metric)!.label;

  const baselineData = manifest.baselines.map((b) => ({
    label: b.label,
    internal: b.internal[metric] as number | null,
    external: (b.external[0]?.metrics[metric] as number | null) ?? null,
  }));

  return (
    <div className="space-y-6">
      {ext && (
        <Alert>
          <Info />
          <AlertTitle>Read the external result first</AlertTitle>
          <AlertDescription>
            On the internal test set (same source as training) accuracy is {pct(ev.internal_test.accuracy)}. On the independent
            external dataset it is {pct(ext.metrics.accuracy)} (sensitivity {pct(ext.metrics.recall)}, specificity{" "}
            {pct(ext.metrics.specificity)}). Performance drops when the population changes – the model must be validated on
            Saint Mary&apos;s patients before clinical reliance.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={ext ? "external" : "internal"}>
        <TabsList>
          {ext && <TabsTrigger value="external">External validation</TabsTrigger>}
          <TabsTrigger value="internal">Internal test</TabsTrigger>
          <TabsTrigger value="cv">Cross-validation</TabsTrigger>
        </TabsList>
        {ext && (
          <TabsContent value="external" className="mt-4">
            <EvaluationPanel
              m={ext.metrics}
              n={ext.metrics.n}
              description={`${ext.name} – a different population (Statlog/Cleveland/Hungary), duplicates removed`}
            />
          </TabsContent>
        )}
        <TabsContent value="internal" className="mt-4">
          <EvaluationPanel
            m={ev.internal_test}
            n={ev.internal_test.n}
            description={`Stratified 20% hold-out of ${manifest.training_data.name}, never seen during training`}
          />
        </TabsContent>
        <TabsContent value="cv" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">5-fold stratified cross-validation (training split)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Mean</TableHead>
                    <TableHead className="text-right">Std. dev.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(ev.cross_validation).map(([k, v]) => (
                    <TableRow key={k}>
                      <TableCell>{METRICS.find((m) => m.key === k)?.label ?? k}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(v.mean)}</TableCell>
                      <TableCell className="text-right tabular-nums">± {num(v.std)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feature importance</CardTitle>
            <CardDescription>Mean decrease in impurity across the forest. Not a measure of causation.</CardDescription>
          </CardHeader>
          <CardContent>
            <FeatureImportanceChart data={manifest.feature_importance.map((f) => ({ label: f.label, value: f.impurity }))} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Training data & configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            <KV k="Training dataset" v={manifest.training_data.name} />
            <KV k="Rows used" v={`${manifest.training_data.data_report.rows_used} (train ${manifest.training_data.n_train} / test ${manifest.training_data.n_test})`} />
            <KV k="CVD prevalence" v={pct(manifest.training_data.data_report.positive_rate)} />
            <KV
              k="Missing values (imputed)"
              v={Object.entries(manifest.training_data.data_report.zero_as_missing)
                .filter(([, n]) => n)
                .map(([c, n]) => `${c}: ${n}`)
                .join(", ") || "none"}
            />
            {Object.entries(manifest.hyperparameters)
              .filter(([k]) => k !== "search")
              .map(([k, v]) => (
                <KV key={k} k={k.replace(/_/g, " ")} v={String(v)} />
              ))}
            {manifest.hyperparameters.search && (
              <KV k="Selection" v={`grid search, ${manifest.hyperparameters.search.cv_folds}-fold CV on ${manifest.hyperparameters.search.scoring}`} />
            )}
            {ev.external_skipped.map((s) => (
              <KV key={s.name} k="Excluded external file" v={`${s.name} (identical to ${s.identical_to})`} />
            ))}
            <KV k="Dataset SHA-256" v={manifest.training_data.sha256.slice(0, 16) + "…"} />
          </CardContent>
        </Card>
      </div>

      {manifest.baselines.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Comparison with other algorithms</CardTitle>
              <CardDescription>
                Same training split for every algorithm (Chapter 2.1.5). Baselines use default settings; Random Forest was tuned.
              </CardDescription>
            </div>
            <Select value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
              <SelectTrigger className="w-44" aria-label="Metric">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.filter((m) => m.key !== "precision").map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardHeader>
          <CardContent className="space-y-6">
            <InternalExternalChart data={baselineData} metricLabel={metricLabel} />
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Algorithm</TableHead>
                    <TableHead className="text-right">Internal acc.</TableHead>
                    <TableHead className="text-right">Internal AUC</TableHead>
                    <TableHead className="text-right">External acc.</TableHead>
                    <TableHead className="text-right">External sens.</TableHead>
                    <TableHead className="text-right">External spec.</TableHead>
                    <TableHead className="text-right">External AUC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {manifest.baselines.map((b) => {
                    const e = b.external[0]?.metrics;
                    return (
                      <TableRow key={b.algorithm} className={b.algorithm === "random_forest" ? "bg-accent/50 font-medium" : undefined}>
                        <TableCell>{b.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(b.internal.accuracy)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(b.internal.roc_auc)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(e?.accuracy)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(e?.recall)}</TableCell>
                        <TableCell className="text-right tabular-nums">{pct(e?.specificity)}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(e?.roc_auc)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1 last:border-0">
      <span className="capitalize text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
