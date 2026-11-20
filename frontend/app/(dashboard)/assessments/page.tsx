"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import type { AssessmentListItem, Paged } from "@/lib/types";
import { EmptyState, ErrorState, PageHeader, Pagination } from "@/components/common";
import { AssessmentTable } from "@/components/assessment-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

export default function AssessmentsPage() {
  const { data: me } = useMe();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [riskBand, setRiskBand] = useState("all");
  const [outcome, setOutcome] = useState("all");
  const [scope, setScope] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = {
    q: q.trim() || undefined,
    riskBand: riskBand === "all" ? undefined : riskBand,
    mine: scope === "mine" ? "true" : undefined,
    outcome: outcome === "all" ? undefined : outcome,
    from: from || undefined,
    to: to ? `${to}T23:59:59` : undefined,
  };
  const list = useQuery({
    queryKey: ["assessments", "list", page, filters],
    queryFn: () => api<Paged<AssessmentListItem>>(`/assessments${qs({ ...filters, page, pageSize: 20 })}`),
    placeholderData: (prev) => prev,
  });

  const set = <T,>(fn: (v: T) => void) => (v: T) => {
    fn(v);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Assessments"
        description="All recorded predictions. Select a row to open the full report."
        actions={
          <>
            {me?.role === "admin" && (
              <Button variant="outline" asChild>
                <a href={`/api/admin/assessments/export.csv${qs({ riskBand: filters.riskBand, from: filters.from, to: filters.to })}`}>
                  <Download /> Export CSV
                </a>
              </Button>
            )}
            <Button asChild>
              <Link href="/assessments/new">
                <Plus /> New assessment
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input placeholder="Hospital number" className="pl-8" value={q} onChange={(e) => set(setQ)(e.target.value)} />
            </div>
            <Select value={scope} onValueChange={set(setScope)}>
              <SelectTrigger className="w-40" aria-label="Clinician filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clinicians</SelectItem>
                <SelectItem value="mine">Only mine</SelectItem>
              </SelectContent>
            </Select>
            <Select value={riskBand} onValueChange={set(setRiskBand)}>
              <SelectTrigger className="w-40" aria-label="Risk filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All risk levels</SelectItem>
                <SelectItem value="high">High risk</SelectItem>
                <SelectItem value="moderate">Moderate risk</SelectItem>
                <SelectItem value="low">Low risk</SelectItem>
              </SelectContent>
            </Select>
            <Select value={outcome} onValueChange={set(setOutcome)}>
              <SelectTrigger className="w-44" aria-label="Outcome filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any outcome</SelectItem>
                <SelectItem value="pending">Awaiting outcome</SelectItem>
                <SelectItem value="recorded">Outcome recorded</SelectItem>
              </SelectContent>
            </Select>
            <Input type="date" className="w-40" aria-label="From date" value={from} onChange={(e) => set(setFrom)(e.target.value)} />
            <Input type="date" className="w-40" aria-label="To date" value={to} onChange={(e) => set(setTo)(e.target.value)} />
          </div>

          {list.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => list.refetch()} />
          ) : list.data!.items.length === 0 ? (
            <EmptyState title="No assessments found" description="Try changing the filters, or run a new assessment." />
          ) : (
            <>
              <AssessmentTable items={list.data!.items} />
              <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
