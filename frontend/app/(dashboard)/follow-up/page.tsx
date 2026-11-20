"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, ShieldAlert } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { CaseListResponse } from "@/lib/types";
import { dateTime, prob } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, PageHeader, Pagination } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { CaseStatusBadge, OutcomeBadge } from "@/components/follow-up";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FILTERS = [
  { value: "active", label: "Active" },
  { value: "overdue", label: "Overdue" },
  { value: "open", label: "Not acknowledged" },
  { value: "referred", label: "Referred" },
  { value: "closed", label: "Closed" },
  { value: "", label: "All" },
];

function minutes(m: number | null) {
  if (m === null || Number.isNaN(m)) return "—";
  if (m < 60) return `${Math.round(m)} min`;
  return `${(m / 60).toFixed(1)} h`;
}

export default function FollowUpPage() {
  const router = useRouter();
  const [status, setStatus] = useState("active");
  const [mine, setMine] = useState(false);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["cases", status, mine, page],
    queryFn: () => api<CaseListResponse>(`/cases${qs({ status: status || undefined, mine: mine ? "true" : undefined, page, pageSize: 20 })}`),
    placeholderData: (prev) => prev,
    refetchInterval: 60_000,
  });

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const active = (d.counts.open ?? 0) + (d.counts.acknowledged ?? 0) + (d.counts.reviewed ?? 0) + (d.counts.referred ?? 0);

  return (
    <>
      <PageHeader
        title="High-risk follow-up"
        description={`Every high-risk result opens a case. Cases not acknowledged within ${d.escalationHours} hours are escalated to administrators by email and SMS.`}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Active cases" value={active} icon={ShieldAlert} cls="bg-tile-pink" iconCls="bg-tile-pink-icon" />
        <Tile label="Overdue (not acknowledged)" value={d.timing.overdue} icon={AlertTriangle} cls="bg-tile-violet" iconCls="bg-tile-violet-icon" />
        <Tile label="Median time to acknowledge" value={minutes(d.timing.medianAckMinutes)} icon={Clock} cls="bg-tile-blue" iconCls="bg-tile-blue-icon" />
        <Tile label="Closed" value={d.counts.closed ?? 0} icon={CheckCircle2} cls="bg-tile-mint" iconCls="bg-tile-mint-icon" />
      </div>

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setStatus(f.value);
                  setPage(1);
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  status === f.value ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent",
                )}
              >
                {f.label}
              </button>
            ))}
            <label className="ml-auto flex items-center gap-2 text-[13px] text-muted-foreground">
              <input type="checkbox" checked={mine} onChange={(e) => { setMine(e.target.checked); setPage(1); }} className="accent-[var(--primary)]" />
              Only my patients
            </label>
          </div>

          {!d.items.length ? (
            <EmptyState title="No cases here" description="High-risk assessments appear here automatically." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Opened</TableHead>
                      <TableHead>Hospital no.</TableHead>
                      <TableHead className="text-right">Probability</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Responsible</TableHead>
                      <TableHead>Outcome</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.items.map((c) => (
                      <TableRow
                        key={c.id}
                        tabIndex={0}
                        className={cn("cursor-pointer", c.overdue && "bg-destructive/5")}
                        onClick={() => router.push(`/assessments/${c.assessmentId}`)}
                        onKeyDown={(e) => e.key === "Enter" && router.push(`/assessments/${c.assessmentId}`)}
                      >
                        <TableCell className="whitespace-nowrap">{dateTime(c.createdAt)}</TableCell>
                        <TableCell className="font-mono font-medium">{c.hospitalNumber}</TableCell>
                        <TableCell className="text-right tabular-nums">{prob(c.probability)}</TableCell>
                        <TableCell>
                          <CaseStatusBadge status={c.status} overdue={c.overdue} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{c.assigneeName ?? "—"}</TableCell>
                        <TableCell>
                          <OutcomeBadge outcome={c.outcome} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={page} pageSize={20} total={d.total} onPage={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function Tile({ label, value, icon: Icon, cls, iconCls }: { label: string; value: React.ReactNode; icon: React.ElementType; cls: string; iconCls: string }) {
  return (
    <div className={cn("flex items-center justify-between rounded-xl p-5", cls)}>
      <div>
        <div className="text-[13px] text-foreground/75">{label}</div>
        <div className="mt-1 text-[26px] font-semibold tabular-nums">{value}</div>
      </div>
      <span className={cn("flex size-10 items-center justify-center rounded-full text-white", iconCls)}>
        <Icon className="size-5" />
      </span>
    </div>
  );
}
