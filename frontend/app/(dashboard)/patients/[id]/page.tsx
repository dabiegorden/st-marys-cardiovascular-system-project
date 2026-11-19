"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/lib/api";
import type { AssessmentListItem, Patient } from "@/lib/types";
import { date, dateTime, pct, prob, RISK_LABEL } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { AssessmentTable } from "@/components/assessment-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PatientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ["patient", id],
    queryFn: () => api<{ patient: Patient; assessments: AssessmentListItem[] }>(`/patients/${id}`),
  });

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { patient, assessments } = q.data;
  const series = [...assessments].reverse().map((a) => ({ t: dateTime(a.createdAt), p: a.probability, band: a.riskBand }));

  return (
    <>
      <PageHeader
        title={patient.hospitalNumber}
        description={`Patient record since ${date(patient.createdAt)} · ${assessments.length} assessment(s)`}
        actions={
          <Button asChild>
            <Link href={`/assessments/new?patient=${encodeURIComponent(patient.hospitalNumber)}`}>
              <Plus /> New assessment
            </Link>
          </Button>
        }
      />

      {assessments.length > 1 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Estimated probability over time</CardTitle>
            <CardDescription>Shaded areas mark the moderate (30–60%) and high (≥ 60%) bands.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={series} margin={{ top: 8, right: 16, left: -12, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <ReferenceArea y1={0.3} y2={0.6} fill="var(--risk-moderate)" fillOpacity={0.08} />
                <ReferenceArea y1={0.6} y2={1} fill="var(--risk-high)" fillOpacity={0.08} />
                <XAxis dataKey="t" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 1]} stroke="var(--muted-foreground)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => pct(v, 0)} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                        <div className="font-medium">{payload[0].payload.t}</div>
                        <div className="text-muted-foreground">
                          {prob(payload[0].payload.p)} · {RISK_LABEL[payload[0].payload.band as keyof typeof RISK_LABEL]}
                        </div>
                      </div>
                    ) : null
                  }
                />
                <Line dataKey="p" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessments</CardTitle>
        </CardHeader>
        <CardContent>
          {assessments.length ? <AssessmentTable items={assessments} showPatient={false} /> : <EmptyState title="No assessments yet" />}
        </CardContent>
      </Card>
    </>
  );
}
