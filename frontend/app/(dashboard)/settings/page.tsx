"use client";

import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useMe } from "@/lib/hooks";
import { PageHeader } from "@/components/common";
import { ChangePasswordForm } from "@/components/change-password-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function SettingsPage() {
  const { data: me } = useMe();
  const { theme, setTheme } = useTheme();

  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Profile</CardTitle>
            <CardDescription>Contact an administrator to change your name, email or role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between border-b py-1.5">
              <span className="text-muted-foreground">Name</span>
              <span className="font-medium">{me?.name}</span>
            </div>
            <div className="flex justify-between border-b py-1.5">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium">{me?.email}</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-muted-foreground">Role</span>
              <span className="font-medium capitalize">{me?.role}</span>
            </div>
            <div className="flex items-center justify-between pt-4">
              <Label htmlFor="dark">Dark theme</Label>
              <Switch id="dark" checked={theme === "dark"} onCheckedChange={(v) => setTheme(v ? "dark" : "light")} />
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
    </>
  );
}
