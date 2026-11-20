"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { UsabilityReport } from "@/lib/types";
import { dateTime, num } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const sec = (s: number | null) => (s === null ? "—" : s < 90 ? `${Math.round(s)} s` : `${(s / 60).toFixed(1)} min`);

export default function UsabilityPage() {
  const q = useQuery({ queryKey: ["admin", "usability"], queryFn: () => api<{ usability: UsabilityReport }>("/admin/usability").then((r) => r.usability) });
  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { sus, taskTime } = q.data;

  return (
    <>
      <PageHeader
        title="Usability study"
        description="System Usability Scale (SUS) questionnaire, offered to each user after their 5th assessment, plus automatically measured task time for the assessment form."
        actions={
          <Button variant="outline" asChild>
            <a href="/api/admin/usability/export.csv">
              <Download /> Export responses (CSV)
            </a>
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="SUS score (mean ± SD)" value={sus.n ? `${num(sus.mean, 1)} ± ${num(sus.sd, 1)}` : "—"} sub={`${sus.n} response${sus.n === 1 ? "" : "s"}`} />
        <Tile
          label="Rating"
          value={sus.interpretation ? `${sus.interpretation.grade} · ${sus.interpretation.adjective}` : "—"}
          sub={sus.interpretation ? (sus.interpretation.acceptable ? "Above the 68-point benchmark" : "Below the 68-point benchmark") : "Benchmark: 68"}
        />
        <Tile label="Median time per assessment" value={sec(taskTime.overall.median)} sub={`IQR ${sec(taskTime.overall.q1)}–${sec(taskTime.overall.q3)} · n = ${taskTime.overall.n}`} />
        <Tile label="Median SUS" value={num(sus.median, 1)} sub={`IQR ${num(sus.q1, 1)}–${num(sus.q3, 1)}`} />
      </div>

      {sus.n < 5 && (
        <Alert className="mb-5">
          <Info />
          <AlertTitle>Collecting responses</AlertTitle>
          <AlertDescription>
            <p>Aim for 5–10 staff responses (Chapter 1, objective e). Each user is asked automatically after their 5th assessment.</p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mean answer per statement</CardTitle>
            <CardDescription>1 = strongly disagree, 5 = strongly agree. Odd statements are positive (higher is better); even ones negative (lower is better).</CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="space-y-2 text-sm">
              {sus.items.map((it) => (
                <li key={it.item} className="flex items-start justify-between gap-4 border-b pb-2 last:border-0">
                  <span>
                    <span className="text-muted-foreground">{it.item}.</span> {it.text}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {num(it.mean, 1)} <span className="text-xs font-normal text-muted-foreground">{it.positive ? "↑" : "↓"}</span>
                  </span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Task time by experience (learning curve)</CardTitle>
              <CardDescription>Median seconds to complete the assessment form, grouped by each user&apos;s n-th assessment.</CardDescription>
            </CardHeader>
            <CardContent>
              {taskTime.overall.n ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={taskTime.byExperience} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} unit=" s" />
                    <Tooltip
                      cursor={{ fill: "var(--accent)", opacity: 0.4 }}
                      content={({ active, payload }) =>
                        active && payload?.length ? (
                          <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                            <div className="font-medium">{payload[0].payload.label} assessment</div>
                            <div className="text-muted-foreground">
                              median {sec(payload[0].payload.median)} · n = {payload[0].payload.n}
                            </div>
                          </div>
                        ) : null
                      }
                    />
                    <Bar dataKey="median" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={48} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState title="No timed assessments yet" description="Timing starts when a user first interacts with the form." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">By role</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Role</TableHead>
                    <TableHead className="text-right">Responses</TableHead>
                    <TableHead className="text-right">Mean SUS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sus.byRole.map((r) => (
                    <TableRow key={r.role}>
                      <TableCell className="capitalize">{r.role}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.n}</TableCell>
                      <TableCell className="text-right tabular-nums">{num(r.mean, 1)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-5">
        <CardHeader>
          <CardTitle className="text-base">Responses</CardTitle>
        </CardHeader>
        <CardContent>
          {!sus.responses.length ? (
            <EmptyState title="No responses yet" />
          ) : (
            <ul className="divide-y">
              {sus.responses.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {r.userName ?? "Former user"} <span className="text-xs font-normal capitalize text-muted-foreground">· {r.role} · after {r.assessmentCount} assessments</span>
                    </div>
                    {r.comment && <p className="mt-1 text-muted-foreground">“{r.comment}”</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold tabular-nums">{r.score}</div>
                    <div className="text-xs text-muted-foreground">{dateTime(r.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
