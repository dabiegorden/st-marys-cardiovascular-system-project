"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const tooShort = next.length > 0 && next.length < 10;
  const mismatch = confirm.length > 0 && next !== confirm;
  const same = next.length > 0 && next === current;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tooShort || mismatch || same) return;
    setError(null);
    setLoading(true);
    const { error } = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setLoading(false);
    if (error) {
      setError(
        error.code === "INVALID_PASSWORD" ? "Your current password is incorrect." : error.message ?? "Could not change password.",
      );
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="current">Current password</Label>
        <Input id="current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new">New password</Label>
        <Input
          id="new"
          type="password"
          autoComplete="new-password"
          aria-invalid={tooShort || same}
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <p className={tooShort || same ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
          {same ? "Choose a password different from the current one." : "At least 10 characters. Use a passphrase you do not use elsewhere."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={mismatch}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        {mismatch && <p className="text-xs text-destructive">Passwords do not match.</p>}
      </div>
      <Button type="submit" disabled={loading || !current || !next || !confirm || tooShort || mismatch || same}>
        {loading && <Loader2 className="animate-spin" />}
        Change password
      </Button>
    </form>
  );
}
