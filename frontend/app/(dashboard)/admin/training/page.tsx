"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { TrainingJob } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { EmptyState, PageHeader } from "@/components/common";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function TrainingPage() {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [searchMode, setSearchMode] = useState("full");

  const jobs = useQuery({
    queryKey: ["admin", "training-jobs"],
    queryFn: () => api<{ items: TrainingJob[] }>("/admin/training-jobs").then((r) => r.items),
    refetchInterval: (q) => (q.state.data?.some((j) => j.status === "running" || j.status === "queued") ? 2000 : false),
  });
  const running = jobs.data?.find((j) => j.status === "running" || j.status === "queued");

  const start = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      fd.append("dataset", file!);
      fd.append("searchMode", searchMode);
      return api<{ job: TrainingJob }>("/admin/training-jobs", { method: "POST", body: fd });
    },
    onSuccess: () => {
      toast.success("Training started.");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["admin", "training-jobs"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not start training."),
  });

  // When a job finishes, refresh model lists
  const prevRunning = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (prevRunning.current && !running) {
      qc.invalidateQueries({ queryKey: ["admin", "models"] });
      toast.info("Training finished – review the result below.");
    }
    prevRunning.current = running?.id;
  }, [running, qc]);

  return (
    <>
      <PageHeader
        title="Retraining"
        description="Train a new Random Forest candidate on an uploaded dataset. The active model is not changed until you activate the candidate."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle className="text-base">Upload dataset</CardTitle>
            <CardDescription>
              CSV or Excel in one of these formats: the Cardiovascular Disease Dataset, the Statlog/Cleveland/Hungary format, or the
              canonical columns (age, sex, resting_bp, max_heart_rate, cholesterol, fasting_blood_sugar, chest_pain_type,
              exercise_angina, resting_ecg, oldpeak, slope, target). Only de-identified data may be uploaded.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label
              htmlFor="dataset"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-8 text-center hover:bg-muted/40"
            >
              <FileSpreadsheet className="size-8 text-muted-foreground" />
              {file ? (
                <span className="text-sm font-medium">
                  {file.name} · {(file.size / 1024).toFixed(0)} KB
                </span>
              ) : (
                <span className="text-sm text-muted-foreground">Choose a .csv, .xlsx or .xls file (max 20 MB)</span>
              )}
              <input
                ref={fileRef}
                id="dataset"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label>Hyperparameter search</Label>
                <Select value={searchMode} onValueChange={setSearchMode}>
                  <SelectTrigger className="w-64">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full grid (36 settings, ~3–4 min)</SelectItem>
                    <SelectItem value="fast">Fast (4 settings, &lt; 1 min)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => start.mutate()} disabled={!file || !!running || start.isPending}>
                {start.isPending ? <Loader2 className="animate-spin" /> : <Upload />}
                Start training
              </Button>
            </div>
            {running && <p className="text-xs text-muted-foreground">A job is already running – wait for it to finish.</p>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">What happens</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-muted-foreground">
              <li>The file is harmonised (column mapping, “0 = not measured”, duplicates removed).</li>
              <li>80/20 stratified split; 5-fold cross-validated grid search on the 80%.</li>
              <li>Evaluation on the 20% hold-out and on the external validation dataset.</li>
              <li>Six baseline algorithms are trained on the same split for comparison.</li>
              <li>Export to ONNX, verified against scikit-learn, saved as a <em>candidate</em>.</li>
              <li>You review the metrics and decide whether to activate it.</li>
            </ol>
          </CardContent>
        </Card>
      </div>

      {running && (
        <Card className="mt-6 border-primary/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Loader2 className="size-4 animate-spin" /> Training {running.datasetFilename}
            </CardTitle>
            <CardDescription>{running.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Progress value={running.progress} />
            <div className="mt-1 text-right text-xs tabular-nums text-muted-foreground">{running.progress}%</div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Training history</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {!jobs.data?.length ? (
            <EmptyState title="No training jobs yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Dataset</TableHead>
                  <TableHead>Search</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.data.map((j) => (
                  <TableRow key={j.id}>
                    <TableCell className="whitespace-nowrap">{dateTime(j.createdAt)}</TableCell>
                    <TableCell>{j.datasetFilename}</TableCell>
                    <TableCell className="capitalize">{j.searchMode}</TableCell>
                    <TableCell className="text-muted-foreground">{j.startedBy ?? "—"}</TableCell>
                    <TableCell>
                      <Badge
                        variant={j.status === "failed" ? "destructive" : j.status === "completed" ? "secondary" : "outline"}
                        className="capitalize"
                      >
                        {j.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-sm">
                      {j.status === "completed" && j.modelVersionId ? (
                        <Button asChild variant="link" className="h-auto p-0">
                          <Link href={`/admin/models/${j.modelVersionId}`}>Review candidate →</Link>
                        </Button>
                      ) : j.status === "failed" ? (
                        <span className="text-destructive">{j.error}</span>
                      ) : (
                        <span className="text-muted-foreground">{j.progress}%</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
