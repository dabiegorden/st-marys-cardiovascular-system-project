"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileClock,
  Layers,
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { api, qs } from "@/lib/api";
import { useActiveModel, useMe } from "@/lib/hooks";
import type { AssessmentListItem, Paged, RiskBand } from "@/lib/types";
import { dateTime, pct, prob, resultLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, RiskBadge } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { DailyAssessmentsChart, RiskDistribution } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface WindowCounts {
  today: number;
  yesterday: number;
  week: number;
  prevWeek: number;
  highRiskWeek: number;
  highRiskPrevWeek: number;
  total: number;
}

interface Stats {
  personal: WindowCounts;
  overall: WindowCounts & {
    patients: number;
    newPatientsWeek: number;
    newPatientsPrevWeek: number;
    riskDistribution: { riskBand: RiskBand; total: number }[];
    daily: { day: string; total: number; positive: number }[];
  };
  followUp: { open: number; active: number; overdue: number; mineActive: number };
  outcomes: { recorded: number; minePending: number };
  admin?: {
    users: { role: string; total: number }[];
    lastTrainingJob: { id: string; status: string; createdAt: string } | null;
  };
}

/* ------------------------------------------------------------------ */

type Tone = "pink" | "blue" | "violet" | "mint";

const TONE: Record<Tone, { bg: string; disc: string; text: string }> = {
  pink: { bg: "bg-tile-pink", disc: "bg-tile-pink-icon", text: "text-tile-pink-icon" },
  blue: { bg: "bg-tile-blue", disc: "bg-tile-blue-icon", text: "text-tile-blue-icon" },
  violet: { bg: "bg-tile-violet", disc: "bg-tile-violet-icon", text: "text-tile-violet-icon" },
  mint: { bg: "bg-tile-mint", disc: "bg-tile-mint-icon", text: "text-tile-mint-icon" },
};

function ColorTile({
  tone,
  label,
  value,
  sub,
  icon: Icon,
}: {
  tone: Tone;
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  icon: React.ElementType;
}) {
  return (
    <div className={cn("flex min-h-[124px] items-center justify-between gap-3 rounded-xl p-5", TONE[tone].bg)}>
      <div className="min-w-0">
        <div className="text-[13px] text-foreground/75">{label}</div>
        <div className="mt-1 text-[28px] font-semibold leading-tight tabular-nums">{value}</div>
        <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-full text-white", TONE[tone].disc)}>
        <Icon className="size-5" />
      </span>
    </div>
  );
}

function PlainTile({ label, value, sub }: { label: string; value: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="min-h-[108px] rounded-xl bg-tile-gray p-5">
      <div className="text-[13px] text-foreground/75">{label}</div>
      <div className="mt-1 text-[26px] font-semibold leading-tight tabular-nums">{value}</div>
      <div className="mt-2 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Section({ title, more, children }: { title: string; more?: string; children: React.ReactNode }) {
  return (
    <Card className="gap-5">
      <div className="flex items-center justify-between px-6">
        <h2 className="text-[15px] font-semibold">{title}</h2>
        {more && (
          <Link href={more} className="text-xs font-medium text-primary hover:underline">
            More
          </Link>
        )}
      </div>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const STEP_STYLE = [
  "from-[var(--step-1-from)] to-[var(--step-1-to)]",
  "from-[var(--step-2-from)] to-[var(--step-2-to)]",
  "from-[var(--step-3-from)] to-[var(--step-3-to)]",
];
const STEP_TEXT = ["text-tile-pink-icon", "text-tile-blue-icon", "text-tile-violet-icon"];

function WelcomeBanner({ name, admin }: { name: string; admin: boolean }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const steps = admin
    ? [
        { title: "New assessment", sub: "Score a patient in under a minute", href: "/assessments/new" },
        { title: "Add staff", sub: "Create clinician accounts", href: "/admin/users" },
        { title: "Review the model", sub: "Versions, retraining, activation", href: "/admin/models" },
      ]
    : [
        { title: "New assessment", sub: "Score a patient in under a minute", href: "/assessments/new" },
        { title: "Find a patient", sub: "History by hospital number", href: "/patients" },
        { title: "Model reliability", sub: "How far to trust a result", href: "/model" },
      ];

  return (
    <Card className="py-6">
      <CardContent className="flex flex-col gap-5 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-primary">
            {greeting}, {name.split(" ")[0]}
          </h1>
          <p className="text-[13px] text-foreground/75">
            {admin ? "Here is the hospital-wide picture. Start with one of these steps." : "Start with one of these steps."}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-3 2xl:w-[660px]">
          {steps.map((s, i) => (
            <Link
              key={s.href}
              href={s.href}
              className={cn(
                "group relative flex min-h-[84px] flex-col justify-center rounded-xl bg-gradient-to-r px-4 py-3 text-white shadow-sm transition-transform hover:-translate-y-0.5",
                STEP_STYLE[i],
              )}
            >
              <span className="pr-12 text-[13px] font-semibold">
                {i + 1}. {s.title}
              </span>
              <span className="mt-1 pr-2 text-[11px] text-white/85">{s.sub}</span>
              <span
                className={cn(
                  "absolute right-3 top-3 rounded-md bg-white px-2 py-0.5 text-[10px] font-bold tracking-wide",
                  STEP_TEXT[i],
                )}
              >
                GO
              </span>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

type Tool = { href: string; title: string; sub: string; icon: React.ElementType; tone: Tone };

const CLINICAL_TOOLS: Tool[] = [
  { href: "/assessments/new", title: "New assessment", sub: "Enter clinical values, get a result", icon: Stethoscope, tone: "pink" },
  { href: "/follow-up", title: "Follow-up", sub: "Acknowledge and close high-risk cases", icon: ShieldCheck, tone: "violet" },
  { href: "/assessments", title: "Assessments", sub: "Search, filter and open reports", icon: ClipboardList, tone: "blue" },
  { href: "/model", title: "Model performance", sub: "External and local validation", icon: BarChart3, tone: "mint" },
];
const ADMIN_TOOLS: Tool[] = [
  { href: "/admin/models", title: "Model versions", sub: "Compare and activate models", icon: Layers, tone: "blue" },
  { href: "/admin/training", title: "Retraining", sub: "Train a candidate on new data", icon: RefreshCcw, tone: "pink" },
  { href: "/admin/users", title: "Users", sub: "Accounts, roles, passwords", icon: Users, tone: "mint" },
  { href: "/admin/monitoring", title: "Monitoring", sub: "Data drift and model health", icon: FileClock, tone: "violet" },
];
const OWN_TOOLS: Tool[] = [
  { href: "/patients", title: "Patients", sub: "Timeline by hospital number", icon: UserRound, tone: "violet" },
  { href: "/assessments", title: "Record outcomes", sub: "Confirmed diagnoses improve validation", icon: CalendarDays, tone: "mint" },
  { href: "/settings", title: "Settings", sub: "Alerts, phone, password, 2FA", icon: Settings, tone: "pink" },
  { href: "/model", title: "Data protection", sub: "Decision support, not diagnosis", icon: ShieldCheck, tone: "blue" },
];

function ToolGrid({ tools }: { tools: Tool[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tools.map((t) => (
        <Link
          key={t.href + t.title}
          href={t.href}
          className="flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-colors hover:border-primary/40 hover:bg-accent/30"
        >
          <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", TONE[t.tone].bg)}>
            <t.icon className={cn("size-4.5", TONE[t.tone].text)} />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-semibold">{t.title}</span>
            <span className="block truncate text-[11px] text-muted-foreground">{t.sub}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */

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
  const { data: model } = useActiveModel();
  const stats = useQuery({ queryKey: ["stats"], queryFn: () => api<{ stats: Stats }>("/stats/overview").then((r) => r.stats) });
  const admin = me?.role === "admin";
  const recent = useQuery({
    queryKey: ["assessments", "recent", me?.role],
    queryFn: () => api<Paged<AssessmentListItem>>(`/assessments${qs({ pageSize: 6, mine: admin ? undefined : "true" })}`),
    enabled: !!me,
  });

  if (stats.isLoading || !me) return <PageLoading />;
  if (stats.error) return <ErrorState error={stats.error} retry={() => stats.refetch()} />;
  const s = stats.data!;
  const scope = admin ? s.overall : s.personal; // admins see the whole hospital, clinicians their own work
  const ext = model?.metrics.external[0];
  const month = s.overall.daily.reduce((a, d) => ({ total: a.total + d.total, positive: a.positive + d.positive }), { total: 0, positive: 0 });
  const staff = s.admin?.users ?? [];
  const staffTotal = staff.reduce((n, u) => n + u.total, 0);

  return (
    <div className="space-y-5">
      <WelcomeBanner name={me.name} admin={admin} />

      <Section title="Today's data" more="/assessments">
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ColorTile
              tone="pink"
              icon={ClipboardList}
              label={admin ? "Assessments today" : "My assessments today"}
              value={scope.today}
              sub={`Yesterday ${scope.yesterday}`}
            />
            <ColorTile
              tone="blue"
              icon={CalendarDays}
              label={admin ? "Last 7 days" : "My last 7 days"}
              value={scope.week}
              sub={`Previous 7 days ${scope.prevWeek}`}
            />
            <ColorTile
              tone="violet"
              icon={Users}
              label="Patients"
              value={s.overall.patients}
              sub={`New this week ${s.overall.newPatientsWeek}`}
            />
            <ColorTile
              tone="mint"
              icon={BarChart3}
              label="Model accuracy"
              value={pct(ext?.accuracy)}
              sub={`External test · sensitivity ${pct(ext?.recall)}`}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/follow-up" className="rounded-xl transition-shadow hover:shadow-md">
              <PlainTile
                label="Open high-risk follow-ups"
                value={admin ? s.followUp.active : s.followUp.mineActive}
                sub={s.followUp.overdue ? `${s.followUp.overdue} overdue – not acknowledged` : `High-risk results (7 days) ${scope.highRiskWeek}`}
              />
            </Link>
            <Link href="/assessments" className="rounded-xl transition-shadow hover:shadow-md">
              <PlainTile
                label="Outcomes recorded"
                value={`${s.outcomes.recorded} / ${s.overall.total}`}
                sub={s.outcomes.minePending ? `${s.outcomes.minePending} of mine awaiting an outcome` : "Used for local validation"}
              />
            </Link>
            <PlainTile
              label="CVD-likely rate (30 days)"
              value={month.total ? pct(month.positive / month.total) : "—"}
              sub={`${month.positive} of ${month.total} assessments`}
            />
            {admin ? (
              <PlainTile
                label="Active staff accounts"
                value={staffTotal}
                sub={staff.map((u) => `${u.total} ${u.role === "admin" ? "admin" : "clinician"}${u.total === 1 ? "" : "s"}`).join(" · ") || "—"}
              />
            ) : (
              <PlainTile label="All staff (7 days)" value={s.overall.week} sub={`Previous 7 days ${s.overall.prevWeek}`} />
            )}
          </div>
        </div>
      </Section>

      <Section title={admin ? "Operations assistant" : "Quick access"} more={admin ? "/admin/models" : undefined}>
        <div className="space-y-3">
          <ToolGrid tools={CLINICAL_TOOLS} />
          <ToolGrid tools={admin ? ADMIN_TOOLS : OWN_TOOLS} />
        </div>
      </Section>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Assessments per day · last 30 days" more="/assessments">
            <DailyAssessmentsChart data={fillDays(s.overall.daily)} />
          </Section>
        </div>
        <Section title={`Risk distribution · ${s.overall.total} total`}>
          {s.overall.total ? (
            <RiskDistribution data={s.overall.riskDistribution} />
          ) : (
            <p className="text-sm text-muted-foreground">No assessments yet.</p>
          )}
        </Section>
      </div>

      <Section title={admin ? "Recent assessments" : "My recent assessments"} more="/assessments">
        {recent.data?.items.length ? (
          <ul className="divide-y">
            {recent.data.items.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/assessments/${a.id}`}
                  className="-mx-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-2 py-3 hover:bg-muted/60"
                >
                  <span className="font-mono text-sm font-medium">{a.hospitalNumber}</span>
                  <span className="text-[13px] text-muted-foreground">{dateTime(a.createdAt)}</span>
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-[13px] tabular-nums text-muted-foreground">
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
                <Link href="/assessments/new">
                  <Plus /> New assessment
                </Link>
              </Button>
            }
          />
        )}
      </Section>
    </div>
  );
}
