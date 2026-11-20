"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Info } from "lucide-react";
import { api } from "@/lib/api";
import type { DriftLevel, DriftReport } from "@/lib/types";
import { num, pct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { DistributionCompareChart } from "@/components/advanced-charts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const LEVEL: Record<DriftLevel, { label: string; cls: string }> = {
  stable: { label: "Stable", cls: "bg-tile-mint text-tile-mint-icon" },
  moderate: { label: "Moderate shift", cls: "bg-tile-blue text-tile-blue-icon" },
  significant: { label: "Significant shift", cls: "bg-destructive/10 text-destructive" },
  insufficient: { label: "Too few data", cls: "bg-tile-gray text-muted-foreground" },
};

function LevelBadge({ level }: { level: DriftLevel }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", LEVEL[level].cls)}>{LEVEL[level].label}</span>;
}

export default function MonitoringPage() {
  const [days, setDays] = useState("30");
  const [selected, setSelected] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["admin", "drift", days],
    queryFn: () => api<{ drift: DriftReport }>(`/admin/monitoring/drift?days=${days}`).then((r) => r.drift),
  });

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const feature = d.features.find((f) => f.feature === selected) ?? d.features[0];

  return (
    <>
      <PageHeader
        title="Model monitoring"
        description={`Compares recent patients with the data ${d.modelVersion} was trained on. A weekly background check emails administrators when a significant shift is found.`}
        actions={
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-40" aria-label="Window">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {!d.available ? (
        <Alert>
          <Info />
          <AlertTitle>No training distribution stored</AlertTitle>
          <AlertDescription>
            <p>{d.message}</p>
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {!d.reliable && (
            <Alert className="mb-5">
              <Info />
              <AlertTitle>Not enough recent assessments yet</AlertTitle>
              <AlertDescription>
                <p>
                  {d.n} assessments in this window; at least {d.minimum} are needed before drift can be judged. Values below are shown for information only.
                </p>
              </AlertDescription>
            </Alert>
          )}

          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Tile label="Overall" value={<LevelBadge level={d.overall ?? "insufficient"} />} />
            <Tile label="Assessments analysed" value={d.n} />
            <Tile label="Flagged CVD likely (recent)" value={pct(d.prediction?.positiveRate)} sub={`Training prevalence ${pct(d.prediction?.trainingPrevalence)}`} />
            <Tile label="Mean predicted probability" value={pct(d.prediction?.meanProbability)} />
          </div>

          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className="text-base">Population stability index (PSI) per input</CardTitle>
                <CardDescription>&lt; 0.10 stable · 0.10–0.25 moderate · &gt; 0.25 significant. Select a row to compare distributions.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Input</TableHead>
                      <TableHead className="text-right">PSI</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Mean (train → recent)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.features.map((f) => (
                      <TableRow
                        key={f.feature}
                        tabIndex={0}
                        className={cn("cursor-pointer", feature?.feature === f.feature && "bg-accent/50")}
                        onClick={() => setSelected(f.feature)}
                        onKeyDown={(e) => e.key === "Enter" && setSelected(f.feature)}
                      >
                        <TableCell className="font-medium">{f.label}</TableCell>
                        <TableCell className="text-right tabular-nums">{num(f.psi, 2)}</TableCell>
                        <TableCell>
                          <LevelBadge level={f.level} />
                        </TableCell>
                        <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                          {f.type === "number" ? `${num(f.trainingMean, 1)} → ${num(f.recentMean, 1)}` : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            {feature && (
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Activity className="size-4 text-primary" /> {feature.label}
                  </CardTitle>
                  <CardDescription>
                    PSI {num(feature.psi, 2)}
                    {feature.missingRate ? ` · ${pct(feature.missingRate, 0)} missing` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <DistributionCompareChart bins={feature.bins} />
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </>
  );
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl bg-card p-5 shadow-[0_1px_2px_rgb(30_27_75/0.04)]">
      <div className="text-[13px] text-foreground/75">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
