"use client";

import { useQuery } from "@tanstack/react-query";
import { Hospital, Info } from "lucide-react";
import { api } from "@/lib/api";
import type { Ci, LocalValidation, Manifest } from "@/lib/types";
import { num, pct } from "@/lib/format";
import { ConfusionMatrix } from "@/components/charts";
import { DecisionCurveChart } from "@/components/advanced-charts";
import { RiskBadge } from "@/components/common";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ciText = (c?: Ci) => (c?.value == null ? "—" : `${pct(c.value)} (${pct(c.low, 0)}–${pct(c.high, 0)})`);

export function LocalValidationCard({ manifest }: { manifest: Manifest }) {
  const q = useQuery({
    queryKey: ["local-validation"],
    queryFn: () => api<{ validation: LocalValidation }>("/model/local-validation").then((r) => r.validation),
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (!q.data) return null;
  const v = q.data;
  const o = v.overall;
  const ext = manifest.evaluation.external[0]?.metrics;
  const int = manifest.evaluation.internal_test;
  const coverage = v.coverage.totalAssessments ? v.coverage.withOutcome / v.coverage.totalAssessments : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hospital className="size-4 text-primary" /> Local validation – Saint Mary&apos;s patients
        </CardTitle>
        <CardDescription>
          Computed from assessments whose diagnosis has been confirmed and recorded by clinicians. {v.coverage.withOutcome} of {v.coverage.totalAssessments}{" "}
          assessments have an outcome ({pct(coverage, 0)}).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {o.n === 0 ? (
          <Alert>
            <Info />
            <AlertTitle>No confirmed outcomes yet</AlertTitle>
            <AlertDescription>
              <p>
                Open an assessment and record the confirmed diagnosis under &quot;Confirmed outcome&quot;. Results appear here automatically and
                become meaningful from about {v.minimumForConclusions} outcomes with both positive and negative cases.
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {o.n < v.minimumForConclusions && (
              <Alert>
                <Info />
                <AlertTitle>Preliminary – small sample</AlertTitle>
                <AlertDescription>
                  <p>
                    Only {o.n} confirmed outcomes ({o.positives} with CVD). The 95% confidence intervals are wide; do not draw conclusions until at
                    least {v.minimumForConclusions} outcomes are recorded.
                  </p>
                </AlertDescription>
              </Alert>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead className="text-right">Internal test</TableHead>
                    <TableHead className="text-right">External test</TableHead>
                    <TableHead className="text-right">Saint Mary&apos;s (95% CI)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <Row label="Patients" a={String(int.n ?? "—")} b={String(ext?.n ?? "—")} c={String(o.n)} />
                  <Row label="Accuracy" a={pct(int.accuracy)} b={pct(ext?.accuracy)} c={ciText(o.accuracy)} />
                  <Row label="Sensitivity" a={pct(int.recall)} b={pct(ext?.recall)} c={ciText(o.sensitivity)} />
                  <Row label="Specificity" a={pct(int.specificity)} b={pct(ext?.specificity)} c={ciText(o.specificity)} />
                  <Row label="Positive predictive value" a={pct(int.precision)} b={pct(ext?.precision)} c={ciText(o.ppv)} />
                  <Row label="ROC-AUC" a={num(int.roc_auc)} b={num(ext?.roc_auc)} c={num(o.roc_auc)} />
                </TableBody>
              </Table>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-3 text-sm font-semibold">Confusion matrix (Saint Mary&apos;s)</h4>
                <ConfusionMatrix cm={o.confusion_matrix} />
              </div>
              <div>
                <h4 className="mb-3 text-sm font-semibold">Observed CVD rate by risk band</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Risk band</TableHead>
                      <TableHead className="text-right">Outcomes</TableHead>
                      <TableHead className="text-right">CVD confirmed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {v.byRiskBand.map((b) => (
                      <TableRow key={b.riskBand}>
                        <TableCell>
                          <RiskBadge band={b.riskBand} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{b.n}</TableCell>
                        <TableCell className="text-right tabular-nums">{b.n ? `${b.confirmed} (${pct(b.observedRate, 0)})` : "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <p className="mt-2 text-xs text-muted-foreground">A well-calibrated model shows a rising CVD rate from low to high band.</p>
              </div>
            </div>
            {v.decisionCurve.length > 0 && (
              <div>
                <h4 className="mb-1 text-sm font-semibold">Decision curve (Saint Mary&apos;s)</h4>
                <DecisionCurveChart points={v.decisionCurve} />
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, a, b, c }: { label: string; a: string; b: string; c: string }) {
  return (
    <TableRow>
      <TableCell>{label}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{a}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">{b}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{c}</TableCell>
    </TableRow>
  );
}
