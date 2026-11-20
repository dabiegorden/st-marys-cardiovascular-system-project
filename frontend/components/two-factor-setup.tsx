"use client";

import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Check, Copy, Download, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Enrol an authenticator app (Google Authenticator, Microsoft Authenticator, …):
 *   1. confirm password → server returns an otpauth:// URI + backup codes
 *   2. scan the QR code, store the backup codes
 *   3. enter a 6-digit code → 2FA becomes active
 */
export function TwoFactorSetup({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"password" | "scan">("password");
  const [password, setPassword] = useState("");
  const [uri, setUri] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [savedCodes, setSavedCodes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const secret = (() => {
    try {
      return new URL(uri).searchParams.get("secret") ?? "";
    } catch {
      return "";
    }
  })();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await authClient.twoFactor.enable({ password });
    setLoading(false);
    if (error || !data) {
      setError(error?.message ?? "Could not start setup. Check your password.");
      return;
    }
    const d = data as { totpURI: string; backupCodes: string[] };
    setUri(d.totpURI);
    setCodes(d.backupCodes);
    setStep("scan");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await authClient.twoFactor.verifyTotp({ code: code.replace(/\s/g, "") });
    setLoading(false);
    if (error) {
      setError("That code did not match. Check the time on your phone and try the newest code.");
      return;
    }
    toast.success("Two-factor authentication is on.");
    onDone();
  }

  function downloadCodes() {
    const blob = new Blob(
      [`St Mary's CVD Support – backup codes\nEach code works once. Keep them somewhere safe.\n\n${codes.join("\n")}\n`],
      { type: "text/plain" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cvd-support-backup-codes.txt";
    a.click();
    setSavedCodes(true);
  }

  if (step === "password") {
    return (
      <form onSubmit={start} className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <p className="text-sm text-muted-foreground">
          You will need an authenticator app on your phone, such as Google Authenticator or Microsoft Authenticator.
        </p>
        <div className="space-y-2">
          <Label htmlFor="pw2fa">Confirm your password</Label>
          <Input id="pw2fa" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={!password || loading}>
          {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Continue
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verify} className="space-y-5">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <QRCodeSVG value={uri} size={156} />
        </div>
        <div className="space-y-2 text-sm">
          <p className="font-medium">1. Scan this QR code with your authenticator app.</p>
          <p className="text-muted-foreground">Can&apos;t scan? Enter this key manually:</p>
          <code className="block break-all rounded-md bg-muted px-2 py-1.5 font-mono text-xs">{secret}</code>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">2. Save your backup codes</p>
        <p className="text-xs text-muted-foreground">Each code signs you in once if you lose your phone. They are shown only now.</p>
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-3 font-mono text-sm sm:grid-cols-5">
          {codes.map((c) => (
            <span key={c}>{c}</span>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={downloadCodes}>
            <Download /> Download
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(codes.join("\n"));
              setSavedCodes(true);
              toast.success("Backup codes copied.");
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm has-checked:border-primary/50 has-checked:bg-accent/40">
          <input
            type="checkbox"
            checked={savedCodes}
            onChange={(e) => setSavedCodes(e.target.checked)}
            className="size-4 accent-primary"
          />
          I have saved these backup codes somewhere safe
          {savedCodes && <Check className="ml-auto size-4 text-primary" />}
        </label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="code2fa">3. Enter the 6-digit code from the app</Label>
        <Input
          id="code2fa"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          className="max-w-40 font-mono text-lg tracking-widest"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={code.replace(/\s/g, "").length !== 6 || loading || !savedCodes}>
        {loading && <Loader2 className="animate-spin" />} Turn on two-factor authentication
      </Button>
      {!savedCodes && (
        <p className="text-xs font-medium text-primary">Tick “I have saved these backup codes” above to continue.</p>
      )}
    </form>
  );
}
