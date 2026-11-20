"use client";

import { use } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api } from "@/lib/api";
import type { Manifest, ModelVersionSummary } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { ModelPerformance } from "@/components/model-performance";
import { OperatingPointCard } from "@/components/operating-point";
import { ActivateDialog } from "@/components/activate-dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/status-badge";

export default function ModelVersionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const q = useQuery({
    queryKey: ["admin", "models", id],
    queryFn: () => api<{ model: ModelVersionSummary & { manifest: Manifest } }>(`/admin/models/${id}`).then((r) => r.model),
  });
  const list = useQuery({
    queryKey: ["admin", "models"],
    queryFn: () => api<{ items: ModelVersionSummary[] }>("/admin/models"),
  });

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const m = q.data;
  const active = list.data?.items.find((x) => x.status === "active");

  return (
    <>
      <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
        <Link href="/admin/models">
          <ArrowLeft /> Model versions
        </Link>
      </Button>
      <PageHeader
        title={m.version}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={m.status} /> trained {dateTime(m.createdAt)}
            {m.activatedAt && <> · activated {dateTime(m.activatedAt)}</>}
          </span>
        }
        actions={
          m.status !== "active" && (
            <ActivateDialog target={m} active={active} trigger={<Button>Activate this version</Button>} />
          )
        }
      />
      <div className="space-y-6">
        <OperatingPointCard model={m} />
        <ModelPerformance manifest={m.manifest} />
      </div>
    </>
  );
}
