"use client";

import Link from "next/link";
import { ShieldX } from "lucide-react";
import { useMe } from "@/lib/hooks";
import { Button } from "@/components/ui/button";

// UI guard only – the API enforces the admin role on every /api/admin route.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  if (me && me.role !== "admin") {
    return (
      <div className="flex flex-col items-center gap-3 py-24 text-center">
        <ShieldX className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Administrators only</h1>
        <p className="max-w-sm text-sm text-muted-foreground">You do not have permission to view this page.</p>
        <Button asChild variant="outline">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}
