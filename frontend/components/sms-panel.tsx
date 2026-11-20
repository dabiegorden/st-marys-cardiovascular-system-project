"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Loader2, MessageSquare, RotateCcw, Send, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { api, qs } from "@/lib/api";
import type { SmsResponse } from "@/lib/types";
import { dateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, Pagination } from "@/components/common";
import { NotificationStatusBadge } from "@/components/notification-status";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const KIND = { high_risk_alert: "High-risk alert", case_escalation: "Escalation", test: "Test" } as Record<string, string>;

export function SmsPanel() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ["admin", "sms", page],
    queryFn: () => api<SmsResponse>(`/admin/sms${qs({ page, pageSize: 25 })}`),
    placeholderData: (prev) => prev,
    refetchInterval: (query) => (query.state.data?.items.some((i) => i.status === "pending" || i.status === "sending") ? 3000 : false),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "sms"] });
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Action failed.");
  const test = useMutation({
    mutationFn: () => api("/admin/sms/test", { method: "POST" }),
    onSuccess: () => {
      toast.success("Test SMS queued to your phone.");
      refresh();
    },
    onError,
  });
  const retry = useMutation({
    mutationFn: (id: string) => api(`/admin/sms/${id}/retry`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Re-queued.");
      refresh();
    },
    onError,
  });

  if (q.isLoading) return <Skeleton className="h-64 rounded-2xl" />;
  if (q.error || !q.data) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const d = q.data;
  const s = d.settings;
  const senderOk = d.senderStatus?.status === "approved";

  return (
    <div className="space-y-5">
      {!s.enabled && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>SMS is not configured</AlertTitle>
          <AlertDescription>
            <p>
              Set <code>ARKESEL_API_KEY</code> and <code>ARKESEL_SENDER_ID</code> (an approved sender ID, max 11 characters) in <code>backend/.env</code> and
              restart the API.
            </p>
          </AlertDescription>
        </Alert>
      )}
      {s.sandbox && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Sandbox mode</AlertTitle>
          <AlertDescription>
            <p>ARKESEL_SANDBOX=true – messages are accepted by Arkesel but not delivered. Turn it off for real alerts.</p>
          </AlertDescription>
        </Alert>
      )}
      {d.usersWithoutPhone.length > 0 && (
        <Alert>
          <MessageSquare />
          <AlertTitle>Staff without a phone number won&apos;t receive SMS</AlertTitle>
          <AlertDescription>
            <p>
              {d.usersWithoutPhone.map((u) => u.name).join(", ")} – add numbers on the{" "}
              <Link href="/admin/users" className="font-medium text-primary underline">
                Users
              </Link>{" "}
              page or in their own Settings.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-3 lg:items-start">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div className="space-y-1.5">
              <CardTitle className="text-base">Arkesel</CardTitle>
              <CardDescription>Ghana SMS gateway</CardDescription>
            </div>
            <Button size="sm" onClick={() => test.mutate()} disabled={!s.enabled || test.isPending}>
              {test.isPending ? <Loader2 className="animate-spin" /> : <Send />} Test SMS to me
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <KV k="Status" v={s.enabled ? (s.sandbox ? "Enabled (sandbox)" : "Enabled") : "Disabled"} />
            <KV k="Sender ID" v={s.sender ?? "—"} />
            <KV
              k="Sender approval"
              v={
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium capitalize", senderOk ? "bg-tile-mint text-tile-mint-icon" : "bg-tile-pink text-tile-pink-icon")}>
                  {d.senderStatus?.status?.replace("_", " ") ?? "unknown"}
                </span>
              }
            />
            <KV k="SMS credits" v={d.balance?.sms_balance !== undefined ? String(d.balance.sms_balance) : d.balance?.error ?? "—"} />
            <KV k="Main balance" v={d.balance?.main_balance ?? "—"} />
            <KV k="Opted out" v={d.optedOutUsers.length ? d.optedOutUsers.map((u) => u.name).join(", ") : "Nobody"} />
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Last 7 days</CardTitle>
            <CardDescription>High-risk alerts and escalations go to staff with a phone number and SMS alerts switched on.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Sent" value={d.summary.sent ?? 0} icon={CheckCircle2} cls="bg-tile-mint text-tile-mint-icon" />
            <Tile label="Queued" value={(d.summary.pending ?? 0) + (d.summary.sending ?? 0)} icon={Clock} cls="bg-tile-blue text-tile-blue-icon" />
            <Tile label="Failed" value={d.summary.failed ?? 0} icon={XCircle} cls="bg-tile-pink text-tile-pink-icon" />
            <Tile label="Credits left" value={Number(d.balance?.sms_balance ?? 0)} icon={Wallet} cls="bg-tile-gray text-muted-foreground" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">SMS log</CardTitle>
        </CardHeader>
        <CardContent>
          {!d.items.length ? (
            <EmptyState title="No SMS yet" description="High-risk alerts are texted here as soon as staff have phone numbers." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Created</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Status</TableHead>
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
                              {KIND[n.kind] ?? n.kind}
                            </Link>
                          ) : (
                            (KIND[n.kind] ?? n.kind)
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div>{n.recipientName ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">+{n.recipientPhone}</div>
                        </TableCell>
                        <TableCell className="max-w-sm text-xs text-muted-foreground">{n.message}</TableCell>
                        <TableCell>
                          <NotificationStatusBadge status={n.status} />
                          {n.lastError && n.status !== "sent" && <div className="mt-1 max-w-56 text-[11px] text-muted-foreground">{n.lastError}</div>}
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
    </div>
  );
}

function KV({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b py-1.5 last:border-0">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
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
