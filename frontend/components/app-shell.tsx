"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  ClipboardList,
  FileClock,
  HeartPulse,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  Users,
  UserRound,
  Layers,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { useMe } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

const IDLE_LIMIT_MS = 30 * 60 * 1000;

type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean };

const CLINICAL: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/assessments/new", label: "New assessment", icon: Plus, exact: true },
  { href: "/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/patients", label: "Patients", icon: UserRound },
  { href: "/model", label: "Model performance", icon: BarChart3, exact: true },
];

const ADMIN: NavItem[] = [
  { href: "/admin/models", label: "Model versions", icon: Layers },
  { href: "/admin/training", label: "Retraining", icon: RefreshCcw },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/audit", label: "Audit log", icon: FileClock },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  if (item.href === "/assessments") return pathname.startsWith("/assessments") && pathname !== "/assessments/new";
  return pathname.startsWith(item.href);
}

function Nav({ admin, onNavigate }: { admin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const link = (item: NavItem) => (
    <Link
      key={item.href}
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive(pathname, item)
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
      )}
    >
      <item.icon className="size-4" />
      {item.label}
    </Link>
  );
  return (
    <nav className="flex flex-col gap-1">
      {CLINICAL.map(link)}
      {admin && (
        <>
          <div className="mt-5 mb-1 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <ShieldCheck className="size-3.5" /> Administration
          </div>
          {ADMIN.map(link)}
        </>
      )}
      <div className="mt-5 border-t pt-3">
        {link({ href: "/settings", label: "Settings", icon: Settings })}
      </div>
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-3">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <HeartPulse className="size-4" />
      </span>
      <span className="leading-tight">
        <span className="block text-sm font-semibold">CVD Support</span>
        <span className="block text-xs text-muted-foreground">St. Mary&apos;s Hospital, Drobo</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading, error } = useMe();
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastActivity = useRef(Date.now());

  async function signOut(reason?: string) {
    await authClient.signOut().catch(() => {});
    qc.clear();
    if (reason) toast.info(reason);
    router.replace("/login");
  }

  // Redirect if a password change is pending
  useEffect(() => {
    if (me?.mustChangePassword) router.replace("/change-password");
  }, [me, router]);

  // Sign out after 30 minutes without interaction
  useEffect(() => {
    const bump = () => (lastActivity.current = Date.now());
    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = window.setInterval(() => {
      if (Date.now() - lastActivity.current > IDLE_LIMIT_MS) signOut("Signed out after 30 minutes of inactivity.");
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading || error || !me || me.mustChangePassword) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Activity className="size-6 animate-pulse text-primary" aria-label="Loading" />
      </div>
    );
  }

  const admin = me.role === "admin";
  const initials = me.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-svh lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="no-print hidden border-r bg-sidebar lg:block">
        <div className="sticky top-0 flex h-svh flex-col gap-6 overflow-y-auto px-3 py-5">
          <Brand />
          <Nav admin={admin} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="no-print sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/90 px-4 backdrop-blur lg:px-8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-sidebar p-4">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="mb-6 mt-2">
                <Brand />
              </div>
              <Nav admin={admin} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <span className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                  {initials}
                </span>
                <span className="hidden text-left leading-tight md:block">
                  <span className="block text-sm font-medium">{me.name}</span>
                  <span className="block text-xs capitalize text-muted-foreground">{me.role}</span>
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="text-sm font-medium">{me.name}</div>
                <div className="text-xs text-muted-foreground">{me.email}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <Settings /> Settings
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <footer className="no-print border-t px-4 py-3 text-center text-xs text-muted-foreground lg:px-8">
          Decision-support tool · not a diagnosis · not clinically validated at this hospital
        </footer>
      </div>
    </div>
  );
}

export function PageLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
