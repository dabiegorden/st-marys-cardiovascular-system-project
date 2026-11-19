"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ModelVersionSummary } from "@/lib/types";
import { pct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ActivateDialog({
  target,
  active,
  trigger,
}: {
  target: ModelVersionSummary;
  active?: ModelVersionSummary | null;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api(`/admin/models/${target.id}/activate`, { method: "POST" }),
    onSuccess: () => {
      toast.success(`${target.version} is now the active model.`);
      qc.invalidateQueries({ queryKey: ["admin", "models"] });
      qc.invalidateQueries({ queryKey: ["model"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Activation failed."),
  });

  const rows: [string, (s?: ModelVersionSummary | null) => string][] = [
    ["External accuracy", (s) => pct(s?.external?.accuracy)],
    ["External sensitivity", (s) => pct(s?.external?.recall)],
    ["External specificity", (s) => pct(s?.external?.specificity)],
    ["External ROC-AUC", (s) => s?.external?.roc_auc?.toFixed(3) ?? "—"],
    ["Internal accuracy", (s) => pct(s?.internal?.accuracy)],
  ];

  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate {target.version}?</DialogTitle>
          <DialogDescription>
            Every new assessment by every clinician will use this model immediately. Past assessments keep the version they were
            made with. This action is recorded in the audit log.
          </DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-normal" />
              <th className="py-1 text-right font-normal">Current ({active?.version ?? "none"})</th>
              <th className="py-1 text-right font-normal">{target.version}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, f]) => (
              <tr key={label} className="border-t">
                <td className="py-1.5">{label}</td>
                <td className="py-1.5 text-right tabular-nums">{f(active)}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{f(target)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <DialogFooter>
          <Button onClick={() => m.mutate()} disabled={m.isPending || m.isSuccess}>
            {m.isPending && <Loader2 className="animate-spin" />}
            {m.isSuccess ? "Activated" : "Activate model"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
