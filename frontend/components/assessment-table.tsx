"use client";

import { useRouter } from "next/navigation";
import type { AssessmentListItem } from "@/lib/types";
import { dateTime, prob, resultLabel } from "@/lib/format";
import { RiskBadge } from "@/components/common";
import { OutcomeBadge } from "@/components/follow-up";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function AssessmentTable({ items, showPatient = true }: { items: AssessmentListItem[]; showPatient?: boolean }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {showPatient && <TableHead>Hospital no.</TableHead>}
            <TableHead>Result</TableHead>
            <TableHead className="text-right">Probability</TableHead>
            <TableHead>Risk</TableHead>
            <TableHead>Outcome</TableHead>
            <TableHead>Clinician</TableHead>
            <TableHead>Model</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((a) => (
            <TableRow
              key={a.id}
              className="cursor-pointer"
              tabIndex={0}
              onClick={() => router.push(`/assessments/${a.id}`)}
              onKeyDown={(e) => e.key === "Enter" && router.push(`/assessments/${a.id}`)}
            >
              <TableCell className="whitespace-nowrap">{dateTime(a.createdAt)}</TableCell>
              {showPatient && <TableCell className="font-mono font-medium">{a.hospitalNumber}</TableCell>}
              <TableCell>
                {resultLabel(a.prediction)}
                {a.imputedFeatures.length > 0 && <span className="ml-1 text-xs text-muted-foreground">(imputed)</span>}
              </TableCell>
              <TableCell className="text-right tabular-nums">{prob(a.probability)}</TableCell>
              <TableCell>
                <RiskBadge band={a.riskBand} />
              </TableCell>
              <TableCell>
                <OutcomeBadge outcome={a.outcome} />
              </TableCell>
              <TableCell className="text-muted-foreground">{a.clinicianName ?? "—"}</TableCell>
              <TableCell className="font-mono text-xs text-muted-foreground">{a.modelVersion}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
