"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { RefreshCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { ModelVersionSummary } from "@/lib/types";
import { dateTime, num, pct } from "@/lib/format";
import { ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { ActivateDialog } from "@/components/activate-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function ModelVersionsPage() {
  const q = useQuery({
    queryKey: ["admin", "models"],
    queryFn: () => api<{ items: ModelVersionSummary[]; activeId: string | null }>("/admin/models"),
  });

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const active = q.data.items.find((m) => m.status === "active");

  return (
    <>
      <PageHeader
        title="Model versions"
        description="Every trained Random Forest. Exactly one version is active; candidates must be reviewed before activation."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/training">
              <RefreshCcw /> Retrain
            </Link>
          </Button>
        }
      />
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Version</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trained</TableHead>
                <TableHead>Training data</TableHead>
                <TableHead className="text-right">Ext. accuracy</TableHead>
                <TableHead className="text-right">Ext. sensitivity</TableHead>
                <TableHead className="text-right">Ext. AUC</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.data.items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono font-medium">
                    <Link href={`/admin/models/${m.id}`} className="hover:underline">
                      {m.version}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={m.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dateTime(m.createdAt)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {m.trainingData} ({m.nTrain} rows)
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{pct(m.external?.accuracy)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(m.external?.recall)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(m.external?.roc_auc)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="ghost">
                        <Link href={`/admin/models/${m.id}`}>Details</Link>
                      </Button>
                      {m.status !== "active" && (
                        <ActivateDialog target={m} active={active} trigger={<Button size="sm" variant="outline">Activate</Button>} />
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
