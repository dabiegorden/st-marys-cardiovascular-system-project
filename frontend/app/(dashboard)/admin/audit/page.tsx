"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { api, qs } from "@/lib/api";
import type { AuditRow, Paged } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { EmptyState, ErrorState, PageHeader, Pagination } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const CATEGORIES = [
  { value: "all", label: "All actions" },
  { value: "auth", label: "Sign-in / sign-out" },
  { value: "assessment", label: "Assessments" },
  { value: "patient", label: "Patients" },
  { value: "model", label: "Models & training" },
  { value: "user", label: "User management" },
];

function summarise(d: Record<string, unknown> | null) {
  if (!d) return "";
  return Object.entries(d)
    .filter(([, v]) => v !== null && typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
}

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("all");
  const [q, setQ] = useState("");

  const list = useQuery({
    queryKey: ["admin", "audit", page, action, q.trim()],
    queryFn: () =>
      api<Paged<AuditRow>>(`/admin/audit-logs${qs({ page, pageSize: 50, action: action === "all" ? undefined : action, q: q.trim() || undefined })}`),
    placeholderData: (prev) => prev,
  });

  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of sign-ins, record access, predictions and administrative actions." />
      <Card>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Select
              value={action}
              onValueChange={(v) => {
                setAction(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-52" aria-label="Action category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Email or record id"
                className="pl-8"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>

          {list.isLoading ? (
            <Skeleton className="h-64" />
          ) : list.error ? (
            <ErrorState error={list.error} retry={() => list.refetch()} />
          ) : !list.data!.items.length ? (
            <EmptyState title="No matching entries" />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Record</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.data!.items.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap text-xs">{dateTime(r.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={r.action.endsWith("failed") ? "destructive" : "outline"} className="font-mono text-[11px]">
                            {r.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{r.userName ?? r.actorEmail ?? "—"}</TableCell>
                        <TableCell className="max-w-40 truncate font-mono text-xs text-muted-foreground" title={r.entityId ?? ""}>
                          {r.entityType ? `${r.entityType}:${r.entityId?.slice(0, 8)}` : "—"}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-xs text-muted-foreground" title={summarise(r.details)}>
                          {summarise(r.details)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">{r.ipAddress ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={page} pageSize={50} total={list.data!.total} onPage={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
