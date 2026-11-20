"use client";

import { Suspense, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCheck, Loader2, MailWarning, Printer, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { api, ApiError, qs } from "@/lib/api";
import { useActiveModel } from "@/lib/hooks";
import type { Assessment, Feature, Paged, Patient } from "@/lib/types";
import { ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { AssessmentResult } from "@/components/assessment-result";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Values = Record<string, string>;

function clientValidate(features: Feature[], values: Values) {
  const errors: Record<string, string> = {};
  for (const f of features) {
    const raw = values[f.name] ?? "";
    if (raw === "") {
      if (f.required) errors[f.name] = "Required.";
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) errors[f.name] = "Enter a number.";
    else if (f.type === "number" && ((f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)))
      errors[f.name] = `Must be between ${f.min} and ${f.max}${f.unit ? ` ${f.unit}` : ""}.`;
  }
  return errors;
}

function FieldInput({
  f,
  value,
  error,
  onChange,
}: {
  f: Feature;
  value: string;
  error?: string;
  onChange: (v: string) => void;
}) {
  const id = `f-${f.name}`;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="flex items-baseline justify-between gap-2">
        <span>
          {f.label}
          {!f.required && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}
        </span>
        {f.type === "number" && (
          <span className="text-xs font-normal text-muted-foreground">
            {f.min}–{f.max} {f.unit}
          </span>
        )}
      </Label>
      {f.type === "category" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full" aria-invalid={!!error}>
            <SelectValue placeholder="Select…" />
          </SelectTrigger>
          <SelectContent>
            {f.options!.map((o) => (
              <SelectItem key={o.value} value={String(o.value)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <div className="relative">
          <Input
            id={id}
            inputMode="decimal"
            type="number"
            step={f.step ?? "any"}
            min={f.min}
            max={f.max}
            value={value}
            aria-invalid={!!error}
            onChange={(e) => onChange(e.target.value)}
            className={f.unit ? "pr-16" : undefined}
          />
          {f.unit && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">
              {f.unit}
            </span>
          )}
        </div>
      )}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : (
        f.help && <p className="text-xs text-muted-foreground">{f.help}</p>
      )}
    </div>
  );
}

function NewAssessment() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const model = useActiveModel();
  const [hospitalNumber, setHospitalNumber] = useState(params.get("patient") ?? "");
  const [values, setValues] = useState<Values>({});
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Assessment | null>(null);
  const [alertCount, setAlertCount] = useState(0);
  const [smsCount, setSmsCount] = useState(0);
  const startedAt = useRef<number | null>(null);

  const lookup = useQuery({
    queryKey: ["patients", "lookup", hospitalNumber.trim()],
    queryFn: () => api<Paged<Patient>>(`/patients${qs({ q: hospitalNumber.trim(), pageSize: 5 })}`),
    enabled: hospitalNumber.trim().length >= 2 && !result,
  });
  const exact = lookup.data?.items.find((p) => p.hospitalNumber === hospitalNumber.trim().toUpperCase());

  const groups = useMemo(() => {
    const g = new Map<string, Feature[]>();
    for (const f of model.data?.features ?? []) g.set(f.group, [...(g.get(f.group) ?? []), f]);
    return [...g.entries()];
  }, [model.data]);

  const submit = useMutation({
    mutationFn: (body: unknown) => api<{ assessment: Assessment; alertRecipients: number; smsRecipients: number; caseId: string | null }>("/assessments", { method: "POST", json: body }),
    onSuccess: ({ assessment, alertRecipients, smsRecipients }) => {
      setResult(assessment);
      setAlertCount(alertRecipients ?? 0);
      setSmsCount(smsRecipients ?? 0);
      startedAt.current = null;
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      qc.invalidateQueries({ queryKey: ["patients"] });
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.errors) {
        setErrors(Object.fromEntries(err.errors.map((e) => [e.field.replace(/^features\./, ""), e.message])));
        toast.error("Please correct the highlighted fields.");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not run the assessment.");
      }
    },
  });

  if (model.isLoading) return <PageLoading />;
  if (model.error || !model.data) return <ErrorState error={model.error} retry={() => model.refetch()} />;
  const m = model.data;

  const markStart = () => {
    if (startedAt.current === null) startedAt.current = performance.now();
  };

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = clientValidate(m.features, values);
    if (!hospitalNumber.trim()) errs.hospitalNumber = "Hospital number is required.";
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Please complete the highlighted fields.");
      document.querySelector('[aria-invalid="true"]')?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const features = Object.fromEntries(
      m.features.map((f) => [f.name, values[f.name] === undefined || values[f.name] === "" ? null : Number(values[f.name])]),
    );
    submit.mutate({
      hospitalNumber: hospitalNumber.trim(),
      features,
      note: note.trim() || undefined,
      formDurationMs: startedAt.current ? Math.round(performance.now() - startedAt.current) : undefined,
    });
  }

  function reset() {
    setResult(null);
    setValues({});
    setNote("");
    setErrors({});
    setHospitalNumber("");
    startedAt.current = null;
  }

  if (result) {
    return (
      <>
        <PageHeader
          title={`Assessment · ${result.hospitalNumber}`}
          description="The result has been saved to the patient's record."
          actions={
            <>
              <Button variant="outline" asChild>
                <Link href={`/assessments/${result.id}?print=1`}>
                  <Printer /> Print report
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href={`/patients/${result.patientId}`}>Patient history</Link>
              </Button>
              <Button onClick={reset}>
                <RotateCcw /> New assessment
              </Button>
            </>
          }
        />
        {result.riskBand === "high" && (
          <Alert className="mb-5 border-risk-high/30 bg-risk-high-soft">
            <MailWarning className="text-risk-high" />
            <AlertTitle>High-risk alert</AlertTitle>
            <AlertDescription>
              <p>
                A follow-up case has been opened (see{" "}
                <Link href="/follow-up" className="font-medium text-primary underline">
                  Follow-up
                </Link>
                ).{" "}
                {alertCount + smsCount > 0
                  ? `Alerts sent: ${alertCount} email${alertCount === 1 ? "" : "s"}, ${smsCount} SMS.`
                  : "No alert could be queued – check the alert configuration and that staff have email/phone details."}
              </p>
            </AlertDescription>
          </Alert>
        )}
        <AssessmentResult
          assessment={result}
          features={m.features}
          bands={m.riskBands}
          threshold={m.decisionThreshold}
          metrics={m.metrics}
          disclaimer={m.disclaimer}
          showInputs
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="New assessment"
        description={`Random Forest ${m.version} · ${m.features.length} clinical variables. All values refer to the current encounter.`}
      />

      <form onSubmit={onSubmit} onFocusCapture={markStart} onPointerDownCapture={markStart} noValidate className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Patient</CardTitle>
            <CardDescription>Identify the patient by hospital folder number only. No names are stored.</CardDescription>
          </CardHeader>
          <CardContent className="max-w-md space-y-1.5">
            <Label htmlFor="hn">Hospital number</Label>
            <Input
              id="hn"
              placeholder="e.g. SMH/2026/00123"
              value={hospitalNumber}
              aria-invalid={!!errors.hospitalNumber}
              onChange={(e) => setHospitalNumber(e.target.value)}
              autoComplete="off"
              className="font-mono uppercase placeholder:normal-case placeholder:font-sans"
            />
            {errors.hospitalNumber ? (
              <p className="text-xs text-destructive">{errors.hospitalNumber}</p>
            ) : hospitalNumber.trim().length >= 2 ? (
              <p className="text-xs text-muted-foreground">
                {exact
                  ? `Existing patient · ${exact.assessmentCount ?? 0} previous assessment(s).`
                  : "New patient – a record will be created when you submit."}
              </p>
            ) : null}
          </CardContent>
        </Card>

        {groups.map(([group, fields]) => (
          <Card key={group}>
            <CardHeader>
              <CardTitle className="text-base">{group}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2">
              {fields.map((f) => (
                <FieldInput
                  key={f.name}
                  f={f}
                  value={values[f.name] ?? ""}
                  error={errors[f.name]}
                  onChange={(v) => {
                    setValues((s) => ({ ...s, [f.name]: v }));
                    if (errors[f.name]) setErrors(({ [f.name]: _, ...rest }) => rest);
                  }}
                />
              ))}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clinical note</CardTitle>
            <CardDescription>Optional – context for colleagues (e.g. referral reason).</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} />
          </CardContent>
        </Card>

        <div className="sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t bg-background/95 px-4 py-3 backdrop-blur lg:-mx-8 lg:px-8">
          <p className="hidden text-xs text-muted-foreground sm:block">
            The result supports clinical judgement; it is not a diagnosis.
          </p>
          <Button type="submit" size="lg" disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            Run assessment
          </Button>
        </div>
      </form>
    </>
  );
}

export default function NewAssessmentPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <NewAssessment />
    </Suspense>
  );
}
