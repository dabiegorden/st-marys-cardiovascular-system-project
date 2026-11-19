"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { HeartPulse, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Assessment, Feature, Metrics, RiskBandDef } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { AssessmentResult } from "@/components/assessment-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface Detail {
  assessment: Assessment;
  model: {
    version: string;
    features: Feature[];
    riskBands: RiskBandDef[];
    decisionThreshold: number;
    metrics: { internal: Metrics; external: (Metrics & { name: string })[] };
  };
  disclaimer: string;
}

export default function AssessmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const search = useSearchParams();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["assessment", id], queryFn: () => api<Detail>(`/assessments/${id}`) });
  const [note, setNote] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (value: string) => api(`/assessments/${id}/note`, { method: "PATCH", json: { note: value } }),
    onSuccess: () => {
      toast.success("Note saved.");
      qc.invalidateQueries({ queryKey: ["assessment", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save note."),
  });

  useEffect(() => {
    if (q.data && search.get("print") === "1") setTimeout(() => window.print(), 400);
  }, [q.data, search]);

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const { assessment: a, model, disclaimer } = q.data;
  const currentNote = note ?? a.clinicianNote ?? "";

  return (
    <>
      {/* Print-only report header */}
      <div className="mb-6 hidden items-center justify-between border-b pb-4 print:flex">
        <div className="flex items-center gap-2 font-semibold">
          <HeartPulse className="size-5" /> Saint Mary&apos;s Hospital, Drobo – CVD risk assessment
        </div>
        <div className="text-right text-xs">
          Printed {dateTime(new Date().toISOString())}
        </div>
      </div>

      <PageHeader
        title={`Assessment · ${a.hospitalNumber}`}
        description={
          <>
            {dateTime(a.createdAt)} · by {a.clinicianName ?? "unknown user"} · model {a.modelVersion}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href={`/patients/${a.patientId}`}>Patient history</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/assessments/new?patient=${encodeURIComponent(a.hospitalNumber)}`}>Re-assess patient</Link>
            </Button>
            <Button onClick={() => window.print()}>
              <Printer /> Print
            </Button>
          </>
        }
      />

      <AssessmentResult
        assessment={a}
        features={model.features}
        bands={model.riskBands}
        threshold={model.decisionThreshold}
        metrics={model.metrics}
        disclaimer={disclaimer}
        showInputs
      />

      <Card className="mt-6 print-area">
        <CardHeader>
          <CardTitle className="text-base">Clinical note</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {a.canEditNote ? (
            <>
              <Textarea className="no-print" rows={3} maxLength={2000} value={currentNote} onChange={(e) => setNote(e.target.value)} />
              <p className="hidden whitespace-pre-wrap text-sm print:block">{currentNote || "—"}</p>
              <Button
                className="no-print"
                size="sm"
                variant="outline"
                disabled={save.isPending || currentNote === (a.clinicianNote ?? "")}
                onClick={() => save.mutate(currentNote)}
              >
                {save.isPending && <Loader2 className="animate-spin" />}
                Save note
              </Button>
            </>
          ) : (
            <p className="whitespace-pre-wrap text-sm">{a.clinicianNote || "No note."}</p>
          )}
        </CardContent>
      </Card>

      <div className="mt-10 hidden grid-cols-2 gap-10 text-sm print:grid">
        <div className="border-t pt-2">Clinician signature</div>
        <div className="border-t pt-2">Date</div>
      </div>
    </>
  );
}
