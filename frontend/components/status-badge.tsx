import type { ModelVersionSummary } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: ModelVersionSummary["status"] }) {
  return (
    <Badge variant={status === "active" ? "default" : status === "candidate" ? "secondary" : "outline"} className="capitalize">
      {status}
    </Badge>
  );
}
