"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, CircleDot, ClipboardCheck, Loader2, MessageSquarePlus, RotateCcw, Send, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Assessment, CaseAction, CaseStatus, FollowUpCase, Outcome } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const CASE_STATUS: Record<CaseStatus, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-tile-pink text-tile-pink-icon" },
  acknowledged: { label: "Acknowledged", cls: "bg-tile-blue text-tile-blue-icon" },
  reviewed: { label: "Reviewed", cls: "bg-tile-violet text-tile-violet-icon" },
  referred: { label: "Referred", cls: "bg-tile-violet text-tile-violet-icon" },
  closed: { label: "Closed", cls: "bg-tile-gray text-muted-foreground" },
};

export function CaseStatusBadge({ status, overdue }: { status: CaseStatus; overdue?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", CASE_STATUS[status].cls)}>{CASE_STATUS[status].label}</span>
      {overdue && (
        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          <AlertTriangle className="size-3" /> Overdue
        </span>
      )}
    </span>
  );
}

const STEPS: CaseStatus[] = ["open", "acknowledged", "reviewed", "closed"];

const EVENT_LABEL: Record<string, string> = {
  created: "Case opened",
  acknowledge: "Acknowledged",
  review: "Reviewed",
  refer: "Referred",
  close: "Closed",
  reopen: "Reopened",
  note: "Note",
  escalated: "Escalated",
};

const ACTIONS: Record<Exclude<CaseAction, "note">, { label: string; icon: React.ElementType; from: CaseStatus[]; note: boolean; hint: string; admin?: boolean }> = {
  acknowledge: { label: "Acknowledge", icon: Check, from: ["open"], note: false, hint: "I have seen this alert and will follow it up." },
  review: { label: "Mark reviewed", icon: ClipboardCheck, from: ["open", "acknowledged"], note: true, hint: "Describe the clinical review (examination, tests ordered…)." },
  refer: { label: "Refer", icon: Send, from: ["open", "acknowledged", "reviewed"], note: true, hint: "Where was the patient referred, and why?" },
  close: { label: "Close case", icon: CheckCircle2, from: ["open", "acknowledged", "reviewed", "referred"], note: true, hint: "Summarise the outcome of the follow-up." },
  reopen: { label: "Reopen", icon: RotateCcw, from: ["closed"], note: true, hint: "Why does this case need further follow-up?", admin: true },
};

export function CasePanel({ c, assessmentId, isAdmin }: { c: FollowUpCase; assessmentId: string; isAdmin: boolean }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<CaseAction | null>(null);
  const [note, setNote] = useState("");

  const act = useMutation({
    mutationFn: ({ action, note }: { action: CaseAction; note?: string }) => api(`/cases/${c.id}/actions`, { method: "POST", json: { action, note } }),
    onSuccess: (_r, v) => {
      toast.success(v.action === "note" ? "Note added." : "Case updated.");
      setDialog(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["assessment", assessmentId] });
      qc.invalidateQueries({ queryKey: ["cases"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Action failed."),
  });

  const stepIndex = c.status === "referred" ? 2 : STEPS.indexOf(c.status);
  const available = (Object.keys(ACTIONS) as Exclude<CaseAction, "note">[]).filter(
    (a) => ACTIONS[a].from.includes(c.status) && (!ACTIONS[a].admin || isAdmin),
  );
  const current = dialog && dialog !== "note" ? ACTIONS[dialog] : null;

  return (
    <Card className="no-print">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="size-4 text-primary" /> High-risk follow-up
          </CardTitle>
          <CardDescription>
            Responsible: {c.assigneeName ?? "unassigned"} · opened {dateTime(c.createdAt)}
            {c.escalationCount > 0 && ` · escalated ${c.escalationCount}×`}
          </CardDescription>
        </div>
        <CaseStatusBadge status={c.status} overdue={c.overdue} />
      </CardHeader>
      <CardContent className="space-y-5">
        {c.overdue && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Not yet acknowledged</AlertTitle>
            <AlertDescription>
              <p>Administrators have been alerted. Acknowledge the case as soon as someone takes responsibility.</p>
            </AlertDescription>
          </Alert>
        )}

        <ol className="flex items-center gap-2" aria-label="Case progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                  i <= stepIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                )}
              >
                {i < stepIndex || c.status === "closed" ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("text-xs", i <= stepIndex ? "font-medium" : "text-muted-foreground")}>
                {s === "reviewed" && c.status === "referred" ? "Referred" : CASE_STATUS[s].label}
              </span>
              {i < STEPS.length - 1 && <span className={cn("h-px flex-1", i < stepIndex ? "bg-primary" : "bg-border")} />}
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap gap-2">
          {available.map((a) => {
            const A = ACTIONS[a];
            return (
              <Button
                key={a}
                size="sm"
                variant={a === "acknowledge" || (a === "close" && c.status !== "open") ? "default" : "outline"}
                disabled={act.isPending}
                onClick={() => (A.note ? setDialog(a) : act.mutate({ action: a }))}
              >
                {act.isPending && act.variables?.action === a ? <Loader2 className="animate-spin" /> : <A.icon />} {A.label}
              </Button>
            );
          })}
          <Button size="sm" variant="ghost" onClick={() => setDialog("note")}>
            <MessageSquarePlus /> Add note
          </Button>
        </div>

        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Timeline</h4>
          <ol className="space-y-3 border-l pl-4">
            {c.events.map((e) => (
              <li key={e.id} className="relative text-sm">
                <CircleDot className="absolute -left-[23px] top-0.5 size-3.5 bg-card text-primary" />
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{EVENT_LABEL[e.action] ?? e.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {dateTime(e.createdAt)} · {e.userName ?? "System"}
                  </span>
                </div>
                {e.note && <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">{e.note}</p>}
              </li>
            ))}
          </ol>
        </div>
      </CardContent>

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{dialog === "note" ? "Add a note" : current?.label}</DialogTitle>
            <DialogDescription>{dialog === "note" ? "Notes are added to the case timeline." : current?.hint}</DialogDescription>
          </DialogHeader>
          <Textarea rows={4} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
          <DialogFooter>
            <Button disabled={!note.trim() || act.isPending} onClick={() => dialog && act.mutate({ action: dialog, note })}>
              {act.isPending && <Loader2 className="animate-spin" />} Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/* ------------------------------------------------------------------ */

const OUTCOME_LABEL: Record<Outcome, string> = { cvd_confirmed: "CVD confirmed", cvd_excluded: "CVD excluded" };

export function OutcomeBadge({ outcome }: { outcome?: Outcome | null }) {
  if (!outcome) return <span className="text-xs text-muted-foreground">Awaiting</span>;
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", outcome === "cvd_confirmed" ? "bg-tile-pink text-tile-pink-icon" : "bg-tile-mint text-tile-mint-icon")}>
      {OUTCOME_LABEL[outcome]}
    </span>
  );
}

export function OutcomePanel({ a, recordedBy }: { a: Assessment; recordedBy: string | null }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(!a.outcome);
  const [outcome, setOutcome] = useState<Outcome | null>(a.outcome ?? null);
  const [source, setSource] = useState(a.outcomeSource ?? "");
  const [note, setNote] = useState(a.outcomeNote ?? "");

  const save = useMutation({
    mutationFn: (body: { outcome: Outcome | null; source?: string; note?: string }) => api(`/assessments/${a.id}/outcome`, { method: "PUT", json: body }),
    onSuccess: () => {
      toast.success("Outcome saved – it now counts towards local validation.");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["assessment", a.id] });
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["local-validation"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const agrees = a.outcome ? (a.outcome === "cvd_confirmed") === (a.prediction === 1) : null;

  return (
    <Card className="no-print">
      <CardHeader>
        <CardTitle className="text-base">Confirmed outcome</CardTitle>
        <CardDescription>
          Record the diagnosis once it is known (e.g. after ECG, echocardiography or cardiology review). Outcomes measure how accurate the model is at Saint
          Mary&apos;s.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!editing && a.outcome ? (
          <div className="space-y-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <OutcomeBadge outcome={a.outcome} />
              <span className={cn("text-xs", agrees ? "text-muted-foreground" : "font-medium text-destructive")}>
                {agrees ? "Model prediction was correct" : "Model prediction was wrong"}
              </span>
            </div>
            {a.outcomeSource && <p><span className="text-muted-foreground">Confirmed by:</span> {a.outcomeSource}</p>}
            {a.outcomeNote && <p className="whitespace-pre-wrap text-muted-foreground">{a.outcomeNote}</p>}
            <p className="text-xs text-muted-foreground">
              Recorded {dateTime(a.outcomeRecordedAt)} {recordedBy && `by ${recordedBy}`}
            </p>
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              Edit outcome
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["cvd_confirmed", "cvd_excluded"] as Outcome[]).map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setOutcome(o)}
                  aria-pressed={outcome === o}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-3 text-left text-sm transition-colors",
                    outcome === o ? "border-primary bg-accent font-medium" : "hover:bg-muted",
                  )}
                >
                  {o === "cvd_confirmed" ? <CheckCircle2 className="size-4 text-tile-pink-icon" /> : <XCircle className="size-4 text-tile-mint-icon" />}
                  {OUTCOME_LABEL[o]}
                </button>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-source">How was it confirmed?</Label>
              <Input id="o-source" placeholder="e.g. Echocardiogram, coronary angiography, cardiology review" value={source} onChange={(e) => setSource(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="o-note">Note (optional)</Label>
              <Textarea id="o-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" disabled={!outcome || save.isPending} onClick={() => save.mutate({ outcome, source: source.trim() || undefined, note: note.trim() || undefined })}>
                {save.isPending && <Loader2 className="animate-spin" />} Save outcome
              </Button>
              {a.outcome && (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => save.mutate({ outcome: null })}>
                    Clear
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
