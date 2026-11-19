import { CheckCircle2, CircleSlash, Clock, Loader2, XCircle } from "lucide-react";
import type { NotificationStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const MAP: Record<NotificationStatus, { label: string; icon: React.ElementType; cls: string }> = {
  sent: { label: "Sent", icon: CheckCircle2, cls: "bg-tile-mint text-tile-mint-icon" },
  pending: { label: "Queued", icon: Clock, cls: "bg-tile-blue text-tile-blue-icon" },
  sending: { label: "Sending", icon: Loader2, cls: "bg-tile-blue text-tile-blue-icon" },
  failed: { label: "Failed", icon: XCircle, cls: "bg-destructive/10 text-destructive" },
  skipped: { label: "Skipped", icon: CircleSlash, cls: "bg-tile-gray text-muted-foreground" },
};

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  const s = MAP[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.cls)}>
      <s.icon className={cn("size-3", status === "sending" && "animate-spin")} />
      {s.label}
    </span>
  );
}
