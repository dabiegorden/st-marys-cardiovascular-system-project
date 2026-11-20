"use client";

import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Manifest, ModelVersionSummary, ThresholdRow } from "@/lib/types";
import { dateTime, pct } from "@/lib/format";
import { DecisionCurveChart, ThresholdTradeoffChart } from "@/components/advanced-charts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const STEPS = Array.from({ length: 19 }, (_, i) => +(0.05 + i * 0.05).toFixed(2));

function nearest(rows: ThresholdRow[], t: number) {
  return rows.reduce((best, r) => (Math.abs(r.threshold - t) < Math.abs(best.threshold - t) ? r : best), rows[0]);
}

function ThresholdSelect({ id, value, onChange, label }: { id: string; value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value.toFixed(2)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STEPS.map((s) => (
            <SelectItem key={s} value={s.toFixed(2)}>
              {pct(s, 0)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function OperatingPointCard({ model }: { model: ModelVersionSummary & { manifest: Manifest } }) {
  const qc = useQueryClient();
  const analysis = model.manifest.operating_analysis;
  const sets = useMemo(
    () => [
      ...(analysis?.external ?? []).map((e) => ({ key: `ext:${e.name}`, label: `External test (${e.name})`, data: e })),
      ...(analysis?.internal ? [{ key: "internal", label: "Internal test", data: analysis.internal }] : []),
    ],
    [analysis],
  );
  const op = model.operatingPoint;
  const bands = op.riskBands;
  const [setKey, setSetKey] = useState(sets[0]?.key ?? "");
  const [threshold, setThreshold] = useState(op.threshold);
  const [lowMax, setLowMax] = useState(bands.find((b) => b.name === "low")?.max ?? 0.3);
  const [highMin, setHighMin] = useState(bands.find((b) => b.name === "high")?.min ?? 0.6);
  const [reason, setReason] = useState("");

  const save = useMutation({
    mutationFn: () => api(`/admin/models/${model.id}/operating-point`, { method: "PUT", json: { threshold, lowMax, highMin, reason } }),
    onSuccess: () => {
      toast.success("Operating point saved. New assessments use it immediately.");
      setReason("");
      qc.invalidateQueries({ queryKey: ["admin", "models"] });
      qc.invalidateQueries({ queryKey: ["model"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  if (!sets.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Operating point</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This version has no threshold analysis. Run <code>python augment_manifest.py</code> for it and <code>npm run models:sync</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const data = sets.find((s) => s.key === setKey)?.data ?? sets[0].data;
  const at = nearest(data.threshold_table, threshold);
  const current = nearest(data.threshold_table, op.threshold);
  const changed = threshold !== op.threshold || lowMax !== (bands.find((b) => b.name === "low")?.max ?? 0.3) || highMin !== (bands.find((b) => b.name === "high")?.min ?? 0.6);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <SlidersHorizontal className="size-4 text-primary" /> Operating point &amp; clinical utility
          </CardTitle>
          <CardDescription>
            Current threshold {pct(op.threshold, 0)} {op.custom ? `(set ${dateTime(op.updatedAt)})` : "(model default)"} · bands Low &lt;{" "}
            {pct(bands.find((b) => b.name === "low")?.max, 0)} ≤ Moderate &lt; {pct(bands.find((b) => b.name === "high")?.min, 0)} ≤ High
          </CardDescription>
          {op.reason && <p className="text-xs text-muted-foreground">Reason: {op.reason}</p>}
        </div>
        <Select value={setKey} onValueChange={setSetKey}>
          <SelectTrigger className="w-64" aria-label="Evaluation data">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sets.map((s) => (
              <SelectItem key={s.key} value={s.key}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h4 className="mb-1 text-sm font-semibold">Sensitivity vs specificity</h4>
            <ThresholdTradeoffChart rows={data.threshold_table} selected={threshold} />
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold">Decision curve (net benefit)</h4>
            <DecisionCurveChart points={data.decision_curve} selected={threshold} />
            <p className="text-xs text-muted-foreground">Where the model line is above both reference lines, using it is clinically useful.</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Compare label="Sensitivity" now={current.sensitivity} next={at.sensitivity} />
          <Compare label="Specificity" now={current.specificity} next={at.specificity} />
          <Compare label="PPV" now={current.ppv} next={at.ppv} />
          <Compare label="NPV" now={current.npv} next={at.npv} />
          <Compare label="Flagged as CVD" now={current.flagged_rate} next={at.flagged_rate} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <ThresholdSelect id="thr" label="Decision threshold (CVD likely ≥)" value={threshold} onChange={setThreshold} />
          <ThresholdSelect id="low" label="Low risk below" value={lowMax} onChange={setLowMax} />
          <ThresholdSelect id="high" label="High risk from" value={highMin} onChange={setHighMin} />
        </div>
        {lowMax >= highMin && (
          <Alert variant="destructive">
            <AlertDescription>The low-risk limit must be below the high-risk limit.</AlertDescription>
          </Alert>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="reason">Clinical reason for this choice (recorded in the audit log)</Label>
          <Textarea
            id="reason"
            rows={2}
            placeholder="e.g. Agreed with cardiology on 20 Nov: prioritise sensitivity because missed CVD is costlier than an extra ECG."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={1000}
          />
        </div>
        <Button onClick={() => save.mutate()} disabled={!changed || reason.trim().length < 10 || lowMax >= highMin || save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" />} Save operating point
        </Button>
        <p className="text-xs text-muted-foreground">
          Applies to new assessments only; each assessment keeps the threshold it was made with. Analysis on the{" "}
          {setKey === "internal" ? "internal test set" : "external test set"} – values at Saint Mary&apos;s may differ.
        </p>
      </CardContent>
    </Card>
  );
}

function Compare({ label, now, next }: { label: string; now: number | null; next: number | null }) {
  const diff = now !== null && next !== null ? next - now : null;
  return (
    <div className="rounded-xl bg-tile-gray p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{pct(next)}</div>
      <div className="text-[11px] text-muted-foreground">
        now {pct(now)}
        {diff !== null && Math.abs(diff) >= 0.0005 && ` (${diff > 0 ? "+" : "−"}${Math.abs(diff * 100).toFixed(1)} pts)`}
      </div>
    </div>
  );
}
