"use client";

import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChangePasswordForm } from "@/components/change-password-form";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export default function ChangePasswordPage() {
  const router = useRouter();
  const qc = useQueryClient();

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">Set a new password</h2>
        <p className="text-sm text-muted-foreground">
          You are using a temporary password. Choose a personal password before continuing.
        </p>
      </div>
      <ChangePasswordForm
        onDone={() => {
          qc.removeQueries();
          toast.success("Password changed.");
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
