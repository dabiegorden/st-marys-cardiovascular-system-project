"use client";

import { useState } from "react";
import { useTheme } from "next-themes";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, LogOut, ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/hooks";
import { PageHeader } from "@/components/common";
import { ChangePasswordForm } from "@/components/change-password-form";
import { TwoFactorSetup } from "@/components/two-factor-setup";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();
  const qc = useQueryClient();
  const [phone, setPhone] = useState<string | null>(null);
  const [twoFaDialog, setTwoFaDialog] = useState<"enable" | "disable" | "codes" | null>(null);
  const [password, setPassword] = useState("");
  const [newCodes, setNewCodes] = useState<string[] | null>(null);

  const prefs = useMutation({
    mutationFn: (body: { highRiskAlerts?: boolean; smsAlerts?: boolean; phoneNumber?: string | null }) =>
      api("/me/preferences", { method: "PATCH", json: body }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ["me"] });
      toast.success(v.phoneNumber !== undefined ? "Phone number saved." : "Preferences saved.");
      if (v.phoneNumber !== undefined) setPhone(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save."),
  });

  const signOutOthers = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.revokeOtherSessions();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => toast.success("Signed out of all other devices."),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not sign out other devices."),
  });

  const disable2fa = useMutation({
    mutationFn: async () => {
      const { error } = await authClient.twoFactor.disable({ password });
      if (error) throw new Error(error.message ?? "Incorrect password.");
    },
    onSuccess: () => {
      toast.success("Two-factor authentication turned off.");
      setTwoFaDialog(null);
      setPassword("");
      qc.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not turn off."),
  });

  const regenerate = useMutation({
    mutationFn: async () => {
      const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
      if (error || !data) throw new Error(error?.message ?? "Incorrect password.");
      return (data as { backupCodes: string[] }).backupCodes;
    },
    onSuccess: (codes) => {
      setNewCodes(codes);
      setPassword("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not generate codes."),
  });

  const phoneValue = phone ?? (me?.phoneNumber ? `0${me.phoneNumber.slice(3)}` : "");

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile &amp; alerts</CardTitle>
            <CardDescription>Contact an administrator to change your name, email or role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row k="Name" v={me?.name} />
            <Row k="Email" v={me?.email} />
            <Row k="Role" v={<span className="capitalize">{me?.role}</span>} />

            <div className="space-y-1.5 pt-3">
              <Label htmlFor="phone">Mobile number (SMS alerts)</Label>
              <div className="flex gap-2">
                <Input id="phone" inputMode="tel" placeholder="e.g. 024 123 4567" value={phoneValue} onChange={(e) => setPhone(e.target.value)} />
                <Button
                  variant="outline"
                  disabled={phone === null || prefs.isPending}
                  onClick={() => prefs.mutate({ phoneNumber: phoneValue.trim() || null })}
                >
                  Save
                </Button>
              </div>
            </div>

            <Toggle
              id="alerts"
              label="Email me high-risk alerts"
              hint={me?.role === "admin" ? "Every high-risk result, escalations, the daily summary and drift warnings." : "High-risk results from assessments you perform, and escalations."}
              checked={me?.highRiskAlerts ?? true}
              disabled={prefs.isPending}
              onChange={(v) => prefs.mutate({ highRiskAlerts: v })}
            />
            <Toggle
              id="sms"
              label="Text me high-risk alerts (SMS)"
              hint={me?.phoneNumber ? `Sent to +${me.phoneNumber}.` : "Add a mobile number first."}
              checked={(me?.smsAlerts ?? true) && !!me?.phoneNumber}
              disabled={prefs.isPending || !me?.phoneNumber}
              onChange={(v) => prefs.mutate({ smsAlerts: v })}
            />
            <Toggle id="dark" label="Dark theme" checked={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>Protect your account with a second sign-in step from an authenticator app.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="flex items-center justify-between gap-3 rounded-xl bg-tile-gray p-3">
                <span className="flex items-center gap-2">
                  {me?.twoFactorEnabled ? <ShieldCheck className="size-4 text-tile-mint-icon" /> : <ShieldOff className="size-4 text-muted-foreground" />}
                  Two-factor authentication is <strong>{me?.twoFactorEnabled ? "on" : "off"}</strong>
                  {me?.twoFactorRequired && <span className="text-xs text-muted-foreground">(required for admins)</span>}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {me?.twoFactorEnabled ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setTwoFaDialog("codes")}>
                      New backup codes
                    </Button>
                    {!me.twoFactorRequired && (
                      <Button variant="outline" size="sm" onClick={() => setTwoFaDialog("disable")}>
                        Turn off
                      </Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" onClick={() => setTwoFaDialog("enable")}>
                    <ShieldCheck /> Turn on two-factor
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => signOutOthers.mutate()} disabled={signOutOthers.isPending}>
                  {signOutOthers.isPending ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out other devices
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Change password</CardTitle>
              <CardDescription>Your other sessions will be signed out.</CardDescription>
            </CardHeader>
            <CardContent>
              <ChangePasswordForm onDone={() => toast.success("Password changed.")} />
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog
        open={!!twoFaDialog}
        onOpenChange={(o) => {
          if (!o) {
            setTwoFaDialog(null);
            setPassword("");
            setNewCodes(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {twoFaDialog === "enable" ? "Turn on two-factor authentication" : twoFaDialog === "disable" ? "Turn off two-factor authentication" : "New backup codes"}
            </DialogTitle>
            <DialogDescription>
              {twoFaDialog === "codes" ? "Your old backup codes stop working." : twoFaDialog === "disable" ? "Confirm with your password." : ""}
            </DialogDescription>
          </DialogHeader>
          {twoFaDialog === "enable" && (
            <TwoFactorSetup
              onDone={() => {
                setTwoFaDialog(null);
                qc.invalidateQueries({ queryKey: ["me"] });
              }}
            />
          )}
          {(twoFaDialog === "disable" || twoFaDialog === "codes") && !newCodes && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="pw">Password</Label>
                <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <DialogFooter>
                <Button
                  disabled={!password || disable2fa.isPending || regenerate.isPending}
                  variant={twoFaDialog === "disable" ? "destructive" : "default"}
                  onClick={() => (twoFaDialog === "disable" ? disable2fa.mutate() : regenerate.mutate())}
                >
                  {(disable2fa.isPending || regenerate.isPending) && <Loader2 className="animate-spin" />}
                  {twoFaDialog === "disable" ? "Turn off" : "Generate"}
                </Button>
              </DialogFooter>
            </>
          )}
          {newCodes && (
            <>
              <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-3 font-mono text-sm sm:grid-cols-5">
                {newCodes.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(newCodes.join("\n"));
                    toast.success("Copied.");
                  }}
                >
                  Copy codes
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b py-1.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 pt-4">
      <div>
        <Label htmlFor={id}>{label}</Label>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}
