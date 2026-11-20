"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/hooks";
import { TwoFactorSetup } from "@/components/two-factor-setup";
import { Button } from "@/components/ui/button";

export default function SetupTwoFactorPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Set up two-factor authentication</h2>
        <p className="text-sm text-muted-foreground">
          {me?.twoFactorRequired
            ? "Administrator accounts can change models and manage staff, so they must be protected by a second factor."
            : "Add a second step to sign-in for extra protection."}
        </p>
      </div>
      <TwoFactorSetup
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["me"] });
          router.replace("/dashboard");
        }}
      />
      <Button
        variant="link"
        className="px-0 text-muted-foreground"
        onClick={async () => {
          await authClient.signOut();
          router.replace("/login");
        }}
      >
        Sign out
      </Button>
    </div>
  );
}
