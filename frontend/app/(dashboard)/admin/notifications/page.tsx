"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2, Mail, MailCheck, RotateCcw, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, qs } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import type { NotificationsResponse } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, PageHeader, Pagination } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { NotificationStatusBadge } from "@/components/notification-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KIND_LABEL = { high_risk_alert: "High-risk alert", daily_digest: "Daily digest", test: "Test" } as const;

function describeCron(expr: string) {
  if (expr === "* * * * *") return "every minute";
  if (expr === "off") return "off";
  const m = expr.match(/^(\d+) (\d+) \* \* \*$/);
  if (m) return `daily at ${m[2].padStart(2, "0")}:${m[1].padStart(2, "0")}`;
  return expr;
}

function Tile({ label, value, icon: Icon, cls }: { label: string; value: number; icon: React.ElementType; cls: string }) {
  return (
    <div className={cn("flex items-center justify-between rounded-xl p-4", cls)}>
      <div>
        <div className="text-[12px] text-foreground/75">{label}</div>
        <div className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      </div>
      <Icon className="size-5 opacity-80" />
    </div>
  );
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [kind, setKind] = useState("all");

  const q = useQuery({
    queryKey: ["admin", "notifications", page, status, kind],
    queryFn: () =>
      api<NotificationsResponse>(
        `/admin/notifications${qs({ page, pageSize: 25, status: status === "all" ? undefined : status, kind: kind === "all" ? undefined : kind })}`,
      ),
    placeholderData: (prev) => prev,
    refetchInterval: (query) => (query.state.data?.items.some((i) => i.status === "pending" || i.status === "sending") ? 3000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "notifications"] });
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Action failed.");

  const test = useMutation({
    mutationFn: () => api("/admin/notifications/test", { method: "POST" }),
    onSuccess: () => {
      toast.success(`Test email queued for ${me?.email}.`);
      refresh();
    },
    onError,
  });
  const digest = useMutation({
    mutationFn: () => api<{ queued: number }>("/admin/notifications/digest", { method: "POST" }),
    onSuccess: (r) => {
      toast.success(r.queued ? `Digest queued for ${r.queued} admin(s).` : "No high-risk assessments in the last 24 hours – nothing to send.");
      refresh();
    },
    onError,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/admin/notifications/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Re-queued.");
      refresh();
    },
    onError,
  });

  if (q.isLoading) return <PageLoading />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const s = d.settings;

  return (
    <>
      <PageHeader
        title="Email alerts"
        description="High-risk results are emailed automatically through Resend. Delivery runs in the background and failed sends are retried."
        actions={
          <>
            <Button variant="outline" onClick={() => digest.mutate()} disabled={digest.isPending || !s.enabled}>
              {digest.isPending ? <Loader2 className="animate-spin" /> : <Mail />} Send digest now
            </Button>
            <Button onClick={() => test.mutate()} disabled={test.isPending || !s.enabled}>
              {test.isPending ? <Loader2 className="animate-spin" /> : <Send />} Send test email to me
            </Button>
          </>
        }
      />

      {!s.enabled && (
        <Alert variant="destructive" className="mb-5">
          <AlertTriangle />
          <AlertTitle>Email is not configured</AlertTitle>
          <AlertDescription>
            <p>
              Set <code>RESEND_API_KEY</code> and <code>RESEND_EMAIL_FROM</code> in <code>backend/.env</code> and restart the
              API. Alerts created meanwhile are recorded as skipped and can be retried.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {d.undeliverableUsers.length > 0 && (
        <Alert className="mb-5">
          <AlertTriangle />
          <AlertTitle>Some accounts cannot receive email</AlertTitle>
          <AlertDescription>
            <p>
              {d.undeliverableUsers.map((u) => `${u.name} (${u.email})`).join(", ")} – update their address on the{" "}
              <Link href="/admin/users" className="font-medium text-primary underline">
                Users
              </Link>{" "}
              page.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Configuration</CardTitle>
            <CardDescription>Set in backend/.env</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV k="Status" v={s.enabled ? "Enabled" : "Disabled"} />
            <KV k="Sender" v={s.from ?? "—"} />
            <KV k="Recipients" v={s.recipients === "all_staff" ? "All active staff" : "Assessing clinician + all admins"} />
            <KV k="Hospital number in email" v={s.showHospitalNumber ? "Shown" : "Masked (last 4)"} />
            <KV k="Delivery sweep" v={describeCron(s.outboxCron)} />
            <KV k="Daily digest" v={`${describeCron(s.digestCron)} (${s.timezone})`} />
            <KV k="Opted out" v={d.optedOutUsers.length ? d.optedOutUsers.map((u) => u.name).join(", ") : "Nobody"} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Last 7 days</CardTitle>
            <CardDescription>Each recipient counts as one email.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Sent" value={d.summary.sent ?? 0} icon={MailCheck} cls="bg-tile-mint text-tile-mint-icon" />
            <Tile label="Queued" value={(d.summary.pending ?? 0) + (d.summary.sending ?? 0)} icon={Clock} cls="bg-tile-blue text-tile-blue-icon" />
            <Tile label="Failed" value={d.summary.failed ?? 0} icon={XCircle} cls="bg-tile-pink text-tile-pink-icon" />
            <Tile label="Skipped" value={d.summary.skipped ?? 0} icon={CheckCircle2} cls="bg-tile-gray text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Delivery log</CardTitle>
          <div className="flex gap-2">
            <Select value={kind} onValueChange={(v) => { setKind(v); setPage(1); }}>
              <SelectTrigger className="w-44" aria-label="Type"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="high_risk_alert">High-risk alerts</SelectItem>
                <SelectItem value="daily_digest">Daily digests</SelectItem>
                <SelectItem value="test">Test emails</SelectItem>
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-36" aria-label="Status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="sent">Sent</SelectItem>
                <SelectItem value="pending">Queued</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="skipped">Skipped</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!d.items.length ? (
            <EmptyState title="No emails yet" description="High-risk assessments will appear here as soon as they are emailed." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Attempts</TableHead>
                      <TableHead>Detail</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {d.items.map((n) => (
                      <TableRow key={n.id}>
                        <TableCell className="whitespace-nowrap text-xs">{dateTime(n.createdAt)}</TableCell>
                        <TableCell className="text-sm">
                          {n.assessmentId ? (
                            <Link href={`/assessments/${n.assessmentId}`} className="text-primary hover:underline">
                              {KIND_LABEL[n.kind]}
                            </Link>
                          ) : (
                            KIND_LABEL[n.kind]
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{n.recipientName ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{n.recipientEmail}</div>
                        </TableCell>
                        <TableCell>
                          <NotificationStatusBadge status={n.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{n.attempts}</TableCell>
                        <TableCell className="max-w-xs text-xs text-muted-foreground">
                          {n.status === "sent"
                            ? `Delivered to Resend ${dateTime(n.sentAt)}`
                            : n.status === "pending" && n.attempts > 0
                              ? `Retry at ${dateTime(n.nextAttemptAt)} · ${n.lastError ?? ""}`
                              : (n.lastError ?? "")}
                        </TableCell>
                        <TableCell className="text-right">
                          {(n.status === "failed" || n.status === "skipped") && (
                            <Button size="sm" variant="outline" onClick={() => retry.mutate(n.id)} disabled={retry.isPending}>
                              <RotateCcw /> Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Pagination page={page} pageSize={25} total={d.total} onPage={setPage} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}
