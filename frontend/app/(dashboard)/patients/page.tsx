"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { Paged, Patient } from "@/lib/types";
import { dateTime, date } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Pagination } from "@/components/common";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function PatientsPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const list = useQuery({
    queryKey: ["patients", "list", q.trim(), page],
    queryFn: () => api<Paged<Patient>>(`/patients${qs({ q: q.trim() || undefined, page, pageSize: 20 })}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader
        title="Patients"
        description="Patients are identified by hospital folder number only. A record is created with the first assessment."
      />
      <Card>
        <CardContent className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder="Search hospital number"
              className="pl-8"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          {list.isLoading ? (
            <Skeleton className="h-48" />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => list.refetch()} />
          ) : list.data!.items.length === 0 ? (
            <EmptyState
              title="No patients found"
              action={
                <Button asChild size="sm">
                  <Link href={`/assessments/new${qs({ patient: q.trim() || undefined })}`}>Start an assessment</Link>
                </Button>
              }
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hospital no.</TableHead>
                    <TableHead className="text-right">Assessments</TableHead>
                    <TableHead>Last assessment</TableHead>
                    <TableHead>First seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.data!.items.map((p) => (
                    <TableRow
                      key={p.id}
                      className="cursor-pointer"
                      tabIndex={0}
                      onClick={() => router.push(`/patients/${p.id}`)}
                      onKeyDown={(e) => e.key === "Enter" && router.push(`/patients/${p.id}`)}
                    >
                      <TableCell className="font-mono font-medium">{p.hospitalNumber}</TableCell>
                      <TableCell className="text-right tabular-nums">{p.assessmentCount}</TableCell>
                      <TableCell>{dateTime(p.lastAssessmentAt)}</TableCell>
                      <TableCell className="text-muted-foreground">{date(p.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Pagination page={page} pageSize={20} total={list.data!.total} onPage={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
