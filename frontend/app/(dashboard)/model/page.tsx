"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Manifest } from "@/lib/types";
import { date } from "@/lib/format";
import { ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { ModelPerformance } from "@/components/model-performance";

export default function ModelPage() {
  const q = useQuery({
    queryKey: ["model", "active", "evaluation"],
    queryFn: () =>
      api<{ model: { version: string; activatedAt: string | null; manifest: Manifest } }>("/model/active/evaluation").then((r) => r.model),
  });

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;

  return (
    <>
      <PageHeader
        title="Model performance"
        description={`Random Forest ${q.data.version} · trained ${date(q.data.manifest.created_at)} · in use since ${date(q.data.activatedAt)}`}
      />
      <ModelPerformance manifest={q.data.manifest} />
    </>
  );
}
