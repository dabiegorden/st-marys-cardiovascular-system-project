"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HeartPulse, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<"password" | "2fa">("password");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function goNext(mustChange?: boolean) {
    const next = params.get("next");
    router.replace(mustChange ? "/change-password" : next && next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error } = await authClient.signIn.email({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError(
        error.status === 429
          ? "Too many sign-in attempts. Please wait 15 minutes and try again."
          : error.code === "BANNED_USER"
            ? "This account has been disabled. Contact the system administrator."
            : "Incorrect email or password.",
      );
      return;
    }
    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setStep("2fa");
      return;
    }
    goNext((data?.user as { mustChangePassword?: boolean } | undefined)?.mustChangePassword);
  }

  async function onVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const clean = code.trim().replace(/\s/g, "");
    const { data, error } = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code: clean, trustDevice })
      : await authClient.twoFactor.verifyTotp({ code: clean, trustDevice });
    setLoading(false);
    if (error) {
      setError(error.status === 429 ? "Too many attempts. Please wait and try again." : "That code is not valid. Try again.");
      return;
    }
    goNext((data as { user?: { mustChangePassword?: boolean } } | null)?.user?.mustChangePassword);
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-primary lg:hidden">
          <HeartPulse className="size-5" />
          <span className="font-semibold">St. Mary&apos;s CVD Support</span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{step === "password" ? "Sign in" : "Two-factor verification"}</h2>
        <p className="text-sm text-muted-foreground">
          {step === "password"
            ? "Use the account issued by the system administrator."
            : useBackup
              ? "Enter one of your backup codes."
              : "Enter the 6-digit code from your authenticator app."}
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {step === "password" ? (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" className="w-full" disabled={loading || !email || !password}>
            {loading && <Loader2 className="animate-spin" />}
            Sign in
          </Button>
        </form>
      ) : (
        <form onSubmit={onVerify} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="code">{useBackup ? "Backup code" : "Authentication code"}</Label>
            <Input
              id="code"
              autoFocus
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              className="font-mono text-lg tracking-widest"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="trust" className="text-sm font-normal text-muted-foreground">
              Trust this device for 30 days
            </Label>
            <Switch id="trust" checked={trustDevice} onCheckedChange={setTrustDevice} />
          </div>
          <Button type="submit" className="w-full" disabled={loading || code.trim().length < 6}>
            {loading ? <Loader2 className="animate-spin" /> : <ShieldCheck />} Verify
          </Button>
          <Button
            type="button"
            variant="link"
            className="w-full text-muted-foreground"
            onClick={() => {
              setUseBackup((v) => !v);
              setCode("");
              setError(null);
            }}
          >
            <KeyRound /> {useBackup ? "Use the authenticator app instead" : "Lost your phone? Use a backup code"}
          </Button>
        </form>
      )}

      <p className="text-xs text-muted-foreground">
        Forgotten your password or lost access to your codes? Contact the system administrator. There is no self-registration.
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
