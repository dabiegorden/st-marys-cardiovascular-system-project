"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellOff, Copy, KeyRound, Loader2, MoreHorizontal, Pencil, ShieldCheck, ShieldOff, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import type { Role, UserRow } from "@/lib/types";
import { date } from "@/lib/format";
import { ErrorState, PageHeader } from "@/components/common";
import { PageLoading } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

function TempPasswordDialog({ value, onClose }: { value: { email: string; password: string } | null; onClose: () => void }) {
  return (
    <Dialog open={!!value} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Temporary password</DialogTitle>
          <DialogDescription>
            Give this password to {value?.email} in person or by phone. It is shown only once. The user must choose a new
            password at first sign-in.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted px-3 py-2">
          <code className="flex-1 font-mono text-lg tracking-wider">{value?.password}</code>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Copy password"
            onClick={() => {
              navigator.clipboard.writeText(value?.password ?? "");
              toast.success("Copied.");
            }}
          >
            <Copy />
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ name: string; email: string; role: Role; phoneNumber: string }>({ name: "", email: "", role: "clinician", phoneNumber: "" });
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string; email: string; phoneNumber: string } | null>(null);

  const users = useQuery({ queryKey: ["admin", "users"], queryFn: () => api<{ items: UserRow[] }>("/admin/users").then((r) => r.items) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "users"] });
  const onError = (e: unknown) => toast.error(e instanceof Error ? e.message : "Action failed.");

  const create = useMutation({
    mutationFn: () => api<{ user: UserRow; temporaryPassword: string }>("/admin/users", {
        method: "POST",
        json: { ...form, phoneNumber: form.phoneNumber.trim() || undefined },
      }),
    onSuccess: (r) => {
      setCreateOpen(false);
      setForm({ name: "", email: "", role: "clinician", phoneNumber: "" });
      setTemp({ email: r.user.email, password: r.temporaryPassword });
      refresh();
    },
    onError,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { role?: Role; active?: boolean; name?: string; email?: string; phoneNumber?: string | null } }) =>
      api(`/admin/users/${id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      toast.success("User updated.");
      setEditing(null);
      refresh();
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError,
  });
  const reset = useMutation({
    mutationFn: (u: UserRow) => api<{ temporaryPassword: string }>(`/admin/users/${u.id}/reset-password`, { method: "POST" }),
    onSuccess: (r, u) => {
      setTemp({ email: u.email, password: r.temporaryPassword });
      refresh();
    },
    onError,
  });

  const reset2fa = useMutation({
    mutationFn: (u: UserRow) => api(`/admin/users/${u.id}/reset-2fa`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Two-factor authentication reset. The user will set it up again at next sign-in.");
      refresh();
    },
    onError,
  });

  if (users.isLoading) return <PageLoading />;
  if (users.error) return <ErrorState error={users.error} retry={() => users.refetch()} />;
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  return (
    <>
      <PageHeader
        title="Users"
        description="Only administrators can create accounts. Disabled users are signed out immediately and cannot sign in."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus /> Add user
          </Button>
        }
      />
      <Card>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.data!.map((u) => {
                const self = u.id === me?.id;
                return (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">
                      {u.name} {self && <span className="text-xs text-muted-foreground">(you)</span>}
                      {!u.highRiskAlerts && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-muted-foreground" title="High-risk email alerts switched off">
                          <BellOff className="size-3" /> alerts off
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{u.email}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {u.phoneNumber ? `+${u.phoneNumber}` : <span className="text-xs">not set</span>}
                      {u.twoFactorEnabled && (
                        <span className="ml-2 inline-flex items-center gap-0.5 text-xs text-tile-mint-icon" title="Two-factor authentication on">
                          <ShieldCheck className="size-3.5" /> 2FA
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={u.role === "admin" ? "default" : "secondary"} className="capitalize">
                        {u.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {u.banned ? (
                        <Badge variant="destructive">Disabled</Badge>
                      ) : u.mustChangePassword ? (
                        <Badge variant="outline">Password change pending</Badge>
                      ) : (
                        <Badge variant="outline">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{date(u.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditing({ id: u.id, name: u.name, email: u.email, phoneNumber: u.phoneNumber ?? "" })}>
                            <Pencil /> Edit details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => reset.mutate(u)}>
                            <KeyRound /> Reset password
                          </DropdownMenuItem>
                          {u.twoFactorEnabled && !self && (
                            <DropdownMenuItem onClick={() => reset2fa.mutate(u)}>
                              <ShieldOff /> Reset two-factor (lost phone)
                            </DropdownMenuItem>
                          )}
                          {!self && (
                            <>
                              <DropdownMenuItem
                                onClick={() => update.mutate({ id: u.id, body: { role: u.role === "admin" ? "clinician" : "admin" } })}
                              >
                                Make {u.role === "admin" ? "clinician" : "administrator"}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                variant={u.banned ? "default" : "destructive"}
                                onClick={() => update.mutate({ id: u.id, body: { active: !!u.banned } })}
                              >
                                {u.banned ? "Enable account" : "Disable account"}
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>A temporary password will be generated. The user must change it at first sign-in.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (form.name.trim().length >= 2 && validEmail) create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="name">Full name</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Mobile number (for SMS alerts)</Label>
              <Input id="phone" inputMode="tel" placeholder="e.g. 024 123 4567" value={form.phoneNumber} onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinician">Clinician – run and view assessments</SelectItem>
                  <SelectItem value="admin">Administrator – also manage users and models</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={create.isPending || form.name.trim().length < 2 || !validEmail}>
                {create.isPending && <Loader2 className="animate-spin" />}
                Create user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TempPasswordDialog value={temp} onClose={() => setTemp(null)} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>Alerts are sent to this email address, so it must be a real, monitored mailbox.</DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                update.mutate({ id: editing.id, body: { name: editing.name.trim(), email: editing.email.trim(), phoneNumber: editing.phoneNumber.trim() || null } });
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Full name</Label>
                <Input id="edit-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-email">Email</Label>
                <Input id="edit-email" type="email" value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-phone">Mobile number</Label>
                <Input id="edit-phone" inputMode="tel" placeholder="e.g. 024 123 4567" value={editing.phoneNumber} onChange={(e) => setEditing({ ...editing, phoneNumber: e.target.value })} />
              </div>
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={update.isPending || editing.name.trim().length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editing.email.trim())}
                >
                  {update.isPending && <Loader2 className="animate-spin" />}
                  Save
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
