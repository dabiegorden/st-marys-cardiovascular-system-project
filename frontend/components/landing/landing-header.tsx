"use client";

import { useState } from "react";
import Link from "next/link";
import { HeartPulse, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

const LEFT = [
  { href: "#top", label: "Home" },
  { href: "#features", label: "Features" },
  { href: "#how-it-works", label: "How it works" },
];
const RIGHT = [
  { href: "#about", label: "About" },
  { href: "#gallery", label: "Gallery" },
];

export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const cta = signedIn ? { href: "/dashboard", label: "Open dashboard" } : { href: "/login", label: "Staff sign in" };

  const link = (l: { href: string; label: string }) => (
    <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-[13px] font-medium uppercase tracking-wide text-foreground/75 transition-colors hover:text-primary">
      {l.label}
    </a>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-6">
          <button
            type="button"
            className="-ml-2 rounded-md p-2 text-foreground/80 hover:bg-muted md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <nav className="hidden items-center gap-6 md:flex" aria-label="Primary">
            {LEFT.map(link)}
          </nav>
        </div>

        <Link href="/" className="flex items-center gap-2" aria-label="St. Mary's Hospital, Drobo – home">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
            <HeartPulse className="size-5" />
          </span>
          <span className="leading-tight">
            <span className="block whitespace-nowrap text-[13px] font-semibold tracking-tight text-primary sm:text-[15px]">
              St. Mary&apos;s Hospital, Drobo
            </span>
            <span className="hidden text-[11px] text-muted-foreground sm:block">Cardiovascular Disease Support</span>
          </span>
        </Link>

        <div className="flex items-center justify-end gap-6">
          <nav className="hidden items-center gap-6 md:flex" aria-label="Secondary">
            {RIGHT.map(link)}
          </nav>
          <Link
            href={cta.href}
            className="whitespace-nowrap rounded-full bg-primary px-3.5 py-2 text-[13px] font-medium text-primary-foreground shadow-sm shadow-primary/30 transition-opacity hover:opacity-90 sm:px-4"
          >
            <span className="sm:hidden">{signedIn ? "Dashboard" : "Sign in"}</span>
            <span className="hidden sm:inline">{cta.label}</span>
          </Link>
        </div>
      </div>

      <nav
        className={cn("border-t bg-card px-4 py-3 md:hidden", open ? "block" : "hidden")}
        aria-label="Mobile"
      >
        <div className="flex flex-col gap-3">{[...LEFT, ...RIGHT].map(link)}</div>
      </nav>
    </header>
  );
}
