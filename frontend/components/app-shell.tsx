"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  BarChart3,
  BellRing,
  Gauge,
  SmilePlus,
  Stethoscope,
  Building2,
  ChevronDown,
  ClipboardList,
  FileClock,
  HeartPulse,
  Layers,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Plus,
  RefreshCcw,
  Settings,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { api } from "@/lib/api";
import { SusPrompt } from "@/components/sus-prompt";
import { useActiveModel, useMe } from "@/lib/hooks";
import type { Me } from "@/lib/types";
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

type NavItem = { href: string; label: string; icon: React.ElementType; exact?: boolean; badge?: number };

const CLINICAL: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/assessments/new", label: "New assessment", icon: Plus, exact: true },
  { href: "/assessments", label: "Assessments", icon: ClipboardList },
  { href: "/follow-up", label: "Follow-up", icon: Stethoscope },
  { href: "/patients", label: "Patients", icon: UserRound },
  { href: "/model", label: "Model performance", icon: BarChart3, exact: true },
];

const ADMIN: NavItem[] = [
  { href: "/admin/models", label: "Model versions", icon: Layers },
  { href: "/admin/training", label: "Retraining", icon: RefreshCcw },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/notifications", label: "Alerts (email & SMS)", icon: Mail },
  { href: "/admin/monitoring", label: "Monitoring", icon: Gauge },
  { href: "/admin/usability", label: "Usability study", icon: SmilePlus },
  { href: "/admin/audit", label: "Audit log", icon: FileClock },
];

function isActive(pathname: string, item: NavItem) {
  if (item.exact) return pathname === item.href;
  if (item.href === "/assessments") return pathname.startsWith("/assessments") && pathname !== "/assessments/new";
  return pathname.startsWith(item.href);
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/* ---------------------------------------------------------------- */

function NavLink({ item, onNavigate, inset }: { item: NavItem; onNavigate?: () => void; inset?: boolean }) {
  const pathname = usePathname();
  const active = isActive(pathname, item);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors",
        inset && "pl-10",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full before:bg-primary"
          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-foreground",
      )}
    >
      <item.icon className={cn("size-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} strokeWidth={1.75} />
      {item.label}
      {!!item.badge && (
        <span className="ml-auto rounded-full bg-primary px-1.5 py-px text-[10px] font-semibold text-primary-foreground tabular-nums">
          {item.badge > 99 ? "99+" : item.badge}
        </span>
      )}
    </Link>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="px-3 pb-1.5 pt-4 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/80">{children}</div>;
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
        <HeartPulse className="size-5" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight">CVD Support</span>
        <span className="block text-[11px] text-muted-foreground">Prediction support</span>
      </span>
    </Link>
  );
}

function HospitalCard({ role }: { role: Me["role"] }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-background p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tile-violet text-tile-violet-icon">
        <Building2 className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold leading-tight">St. Mary&apos;s Hospital</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          Drobo, Ghana
          <span className="rounded border border-primary/40 px-1 py-px text-[10px] font-medium capitalize leading-none text-primary">
            {role}
          </span>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ me, onNavigate, onSignOut, openCases }: { me: Me; onNavigate?: () => void; onSignOut: () => void; openCases?: number }) {
  const pathname = usePathname();
  const admin = me.role === "admin";
  const [adminOpen, setAdminOpen] = useState(true);
  const adminActive = pathname.startsWith("/admin");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Brand />
      </div>

      <div className="px-4 pb-2">
        <HospitalCard role={me.role} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Main">
        <SectionLabel>Clinical</SectionLabel>
        <div className="flex flex-col gap-0.5">
          {CLINICAL.map((item) => (
            <NavLink key={item.href} item={item.href === "/follow-up" ? { ...item, badge: openCases } : item} onNavigate={onNavigate} />
          ))}
        </div>

        {admin && (
          <>
            <SectionLabel>Management</SectionLabel>
            <button
              type="button"
              onClick={() => setAdminOpen((o) => !o)}
              aria-expanded={adminOpen}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] transition-colors hover:bg-sidebar-hover",
                adminActive && !adminOpen ? "font-medium text-primary" : "text-sidebar-foreground",
              )}
            >
              <ShieldCheck className={cn("size-4", adminActive && !adminOpen ? "text-primary" : "text-muted-foreground")} strokeWidth={1.75} />
              Administration
              <ChevronDown className={cn("ml-auto size-4 text-muted-foreground transition-transform", adminOpen && "rotate-180")} />
            </button>
            {adminOpen && (
              <div className="mt-0.5 flex flex-col gap-0.5">
                {ADMIN.map((item) => (
                  <NavLink key={item.href} item={item} onNavigate={onNavigate} inset />
                ))}
              </div>
            )}
          </>
        )}

        <SectionLabel>Account</SectionLabel>
        <NavLink item={{ href: "/settings", label: "Settings", icon: Settings }} onNavigate={onNavigate} />
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl p-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tile-pink text-xs font-semibold text-primary">
            {initialsOf(me.name)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium">{me.name}</div>
            <div className="truncate text-[11px] text-muted-foreground">{me.email}</div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onSignOut} aria-label="Sign out" title="Sign out">
            <LogOut className="text-muted-foreground" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- */

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me, isLoading, error } = useMe();
  const needs2fa = !!me && me.twoFactorRequired && !me.twoFactorEnabled;
  const ready = !!me && !me.mustChangePassword && !needs2fa;
  const { data: model } = useActiveModel(ready);
  const { data: openCases } = useQuery({
    queryKey: ["cases", "badge"],
    queryFn: () => api<{ counts: Record<string, number> }>("/cases?status=open&pageSize=1").then((r) => r.counts.open ?? 0),
    enabled: ready,
    refetchInterval: 60_000,
  });
  const [mobileOpen, setMobileOpen] = useState(false);
  const lastActivity = useRef(Date.now());

  async function signOut(reason?: string) {
    await authClient.signOut().catch(() => {});
    qc.clear();
    if (reason) toast.info(reason);
    router.replace("/login");
  }

  useEffect(() => {
    if (me?.mustChangePassword) router.replace("/change-password");
    else if (me && me.twoFactorRequired && !me.twoFactorEnabled) router.replace("/setup-2fa");
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

  if (isLoading || error || !ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Activity className="size-6 animate-pulse text-primary" aria-label="Loading" />
      </div>
    );
  }

  const today = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(new Date());

  return (
    <div className="min-h-svh bg-background lg:flex">
      {/* Sidebar (desktop) */}
      <aside className="no-print hidden w-[248px] shrink-0 border-r border-sidebar-border bg-sidebar lg:block">
        <div className="sticky top-0 h-svh">
          <SidebarContent me={me} onSignOut={() => signOut()} openCases={openCases} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 bg-background/90 px-4 backdrop-blur lg:px-8">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[272px] bg-sidebar p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarContent me={me} onNavigate={() => setMobileOpen(false)} onSignOut={() => signOut()} openCases={openCases} />
            </SheetContent>
          </Sheet>

          <div className="lg:hidden">
            <Brand />
          </div>
          <span className="hidden text-[13px] text-muted-foreground lg:block">{today}</span>

          <div className="ml-auto flex items-center gap-1 sm:gap-4">
            {!!openCases && (
              <Link
                href="/follow-up"
                className="hidden items-center gap-1.5 rounded-full bg-tile-pink px-3 py-1 text-[12px] font-medium text-primary hover:underline md:flex"
              >
                <BellRing className="size-3.5" /> {openCases} open high-risk case{openCases === 1 ? "" : "s"}
              </Link>
            )}
            {model && (
              <Link
                href="/model"
                className="hidden items-center gap-1.5 rounded-full bg-card px-3 py-1 text-[12px] text-foreground/80 shadow-sm hover:text-primary sm:flex"
              >
                <span className="size-1.5 rounded-full bg-tile-mint-icon" aria-hidden />
                Model {model.version}
              </Link>
            )}
            <Link href="/settings" className="hidden text-[13px] text-foreground/80 hover:text-primary sm:block">
              Settings
            </Link>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-2 px-1.5" aria-label="Account menu">
                  <span className="flex size-8 items-center justify-center rounded-full bg-tile-pink text-xs font-semibold text-primary">
                    {initialsOf(me.name)}
                  </span>
                  <ChevronDown className="size-4 text-muted-foreground" />
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
          </div>
        </header>

        <main className="flex-1 px-4 pb-8 pt-2 lg:px-8">
          <div className="w-full">{children}</div>
        </main>
        <SusPrompt />
        <footer className="no-print px-4 py-4 text-xs text-muted-foreground lg:px-8">
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
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
        <Skeleton className="h-28 rounded-2xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
}
