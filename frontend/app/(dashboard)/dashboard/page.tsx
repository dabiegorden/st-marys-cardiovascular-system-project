"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CalendarDays, ClipboardList, Layers, Plus, UserRound, Users } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import type { AssessmentListItem, Paged, RiskBand } from "@/lib/types";
import { dateTime, pct, prob, resultLabel } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, RiskBadge, StatCard } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { DailyAssessmentsChart, RiskDistribution } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Stats {
  personal: { today: number; week: number; highRiskWeek: number; total: number };
  overall: {
    total: number;
    week: number;
    patients: number;
    riskDistribution: { riskBand: RiskBand; total: number }[];
    daily: { day: string; total: number; positive: number }[];
  };
  admin?: {
    users: { role: string; total: number }[];
    lastTrainingJob: { id: string; status: string; createdAt: string; finishedAt: string | null } | null;
    activeModel: {
      version: string;
      activatedAt: string | null;
      internal: { accuracy: number; recall: number; roc_auc: number };
      external: { name: string; accuracy: number; recall: number; roc_auc: number }[];
    } | null;
  };
}

function fillDays(daily: Stats["overall"]["daily"]) {
  const map = new Map(daily.map((d) => [d.day, d]));
  const out = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 864e5);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push(map.get(key) ?? { day: key, total: 0, positive: 0 });
  }
  return out;
}

export default function DashboardPage() {
  const { data: me } = useMe();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<{ stats: Stats }>("/stats/overview").then((r) => r.stats) });
  const recent = useQuery({
    queryKey: ["assessments", "recent", me?.role],
    queryFn: () => api<Paged<AssessmentListItem>>(`/assessments${qs({ pageSize: 6, mine: me?.role === "admin" ? undefined : "true" })}`),
    enabled: !!me,
  });

  if (stats.isLoading) return <PageLoading />;
  if (stats.error) return <ErrorState error={stats.error} retry={() => stats.refetch()} />;
  const s = stats.data!;
  const admin = s.admin;

  return (
    <>
      <PageHeader
        title={`Welcome, ${me?.name.split(" ")[0] ?? ""}`}
        description={admin ? "System overview and your recent activity." : "Your assessments at a glance."}
        actions={
          <Button asChild>
            <Link href="/assessments/new">
              <Plus /> New assessment
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="My assessments today" value={s.personal.today} icon={CalendarDays} />
        <StatCard label="My assessments (7 days)" value={s.personal.week} icon={ClipboardList} />
        <StatCard label="High-risk results (7 days)" value={s.personal.highRiskWeek} icon={AlertTriangle} tone="high" hint="My assessments only" />
        {admin ? (
          <StatCard label="All assessments" value={s.overall.total} icon={Activity} hint={`${s.overall.patients} patients`} />
        ) : (
          <StatCard label="My assessments (all time)" value={s.personal.total} icon={Activity} />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Assessments per day</CardTitle>
            <CardDescription>All users · last 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <DailyAssessmentsChart data={fillDays(s.overall.daily)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Risk distribution</CardTitle>
            <CardDescription>All assessments to date ({s.overall.total})</CardDescription>
          </CardHeader>
          <CardContent>
            {s.overall.total ? <RiskDistribution data={s.overall.riskDistribution} /> : <p className="text-sm text-muted-foreground">No assessments yet.</p>}
          </CardContent>
        </Card>
      </div>

      {admin && (
        <div className="mt-6 grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="size-4" /> Active model
              </CardTitle>
              <CardDescription>{admin.activeModel?.version ?? "None"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {admin.activeModel && (
                <>
                  <Row k="External accuracy" v={pct(admin.activeModel.external[0]?.accuracy)} />
                  <Row k="External sensitivity" v={pct(admin.activeModel.external[0]?.recall)} />
                  <Row k="External ROC-AUC" v={admin.activeModel.external[0]?.roc_auc?.toFixed(3) ?? "—"} />
                </>
              )}
              <Button asChild variant="link" className="px-0">
                <Link href="/model">View performance</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" /> Active users
              </CardTitle>
              <CardDescription>Accounts not disabled</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {admin.users.map((u) => (
                <Row key={u.role} k={u.role === "admin" ? "Administrators" : "Clinicians"} v={String(u.total)} />
              ))}
              <Button asChild variant="link" className="px-0">
                <Link href="/admin/users">Manage users</Link>
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-4" /> Last retraining
              </CardTitle>
              <CardDescription>{admin.lastTrainingJob ? dateTime(admin.lastTrainingJob.createdAt) : "Never"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {admin.lastTrainingJob && <Row k="Status" v={admin.lastTrainingJob.status} />}
              <Button asChild variant="link" className="px-0">
                <Link href="/admin/training">Retraining</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>{admin ? "Recent assessments (all users)" : "My recent assessments"}</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.data?.items.length ? (
            <ul className="divide-y">
              {recent.data.items.map((a) => (
                <li key={a.id}>
                  <Link href={`/assessments/${a.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 hover:bg-muted/40 -mx-2 px-2 rounded-md">
                    <span className="font-mono text-sm font-medium">{a.hospitalNumber}</span>
                    <span className="text-sm text-muted-foreground">{dateTime(a.createdAt)}</span>
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {resultLabel(a.prediction)} · {prob(a.probability)}
                      </span>
                      <RiskBadge band={a.riskBand} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              title="No assessments yet"
              description="Run the first assessment to see it here."
              action={
                <Button asChild size="sm">
                  <Link href="/assessments/new">New assessment</Link>
                </Button>
              }
            />
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium tabular-nums capitalize">{v}</span>
    </div>
  );
}
