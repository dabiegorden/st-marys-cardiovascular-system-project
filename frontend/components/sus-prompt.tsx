"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { SusStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

const SCALE = [
  { v: 1, label: "Strongly disagree" },
  { v: 2, label: "Disagree" },
  { v: 3, label: "Neutral" },
  { v: 4, label: "Agree" },
  { v: 5, label: "Strongly agree" },
];

/** System Usability Scale questionnaire, offered after the user's n-th assessment. */
export function SusPrompt() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["me", "sus"], queryFn: () => api<{ sus: SusStatus }>("/me/sus").then((r) => r.sus), staleTime: 10 * 60_000 });
  const [answers, setAnswers] = useState<(number | null)[]>(Array(10).fill(null));
  const [comment, setComment] = useState("");
  const [closed, setClosed] = useState(false);

  const submit = useMutation({
    mutationFn: () => api<{ score: number }>("/me/sus", { method: "POST", json: { answers, comment: comment.trim() || undefined } }),
    onSuccess: () => {
      toast.success("Thank you – your feedback helps evaluate the system.");
      qc.invalidateQueries({ queryKey: ["me", "sus"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit."),
  });
  const dismiss = useMutation({
    mutationFn: () => api("/me/sus/dismiss", { method: "POST" }),
    onSettled: () => setClosed(true),
  });

  const open = Boolean(q.data?.shouldPrompt) && !closed && !submit.isSuccess;
  const complete = answers.every((a) => a !== null);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && dismiss.mutate()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How is the system working for you?</DialogTitle>
          <DialogDescription>
            You have completed {q.data?.assessmentsDone} assessments. Please answer 10 short statements (about 2 minutes). Answers are used to
            evaluate usability and are reported only in aggregate.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-4">
          {q.data?.items.map((text, i) => (
            <li key={i} className="space-y-2">
              <p className="text-sm font-medium">
                {i + 1}. {text}
              </p>
              <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={`Statement ${i + 1}`}>
                {SCALE.map((s) => (
                  <button
                    key={s.v}
                    type="button"
                    role="radio"
                    aria-checked={answers[i] === s.v}
                    onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? s.v : x)))}
                    className={cn(
                      "rounded-lg border px-1 py-2 text-center text-[11px] leading-tight transition-colors",
                      answers[i] === s.v ? "border-primary bg-accent font-medium text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    <span className="block text-sm font-semibold">{s.v}</span>
                    {s.label}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <Textarea placeholder="Anything else? (optional)" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} rows={2} />
        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => dismiss.mutate()}>
            Remind me later
          </Button>
          <Button onClick={() => submit.mutate()} disabled={!complete || submit.isPending}>
            {submit.isPending && <Loader2 className="animate-spin" />} Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
