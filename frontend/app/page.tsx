import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  BellRing,
  ClipboardCheck,
  ClipboardList,
  Gauge,
  Hospital,
  HeartPulse,
  Lightbulb,
  LockKeyhole,
  Route,
  ShieldAlert,
  Stethoscope,
} from "lucide-react";
import { LandingHeader } from "@/components/landing/landing-header";
import { AboutArt, HeroArt } from "@/components/landing/heart-art";
import dashboardShot from "@/public/landing/gallery-dashboard.png";
import assessmentShot from "@/public/landing/gallery-assessment.png";
import modelShot from "@/public/landing/gallery-model.png";

export const metadata: Metadata = {
  title: "St. Mary's Hospital, Drobo · Cardiovascular Disease Support",
  description:
    "Random Forest–based cardiovascular disease risk prediction and follow-up for authorised staff of St. Mary's Hospital, Drobo.",
};

const FEATURES = [
  {
    title: "Risk prediction",
    text: "A Random Forest model estimates the probability of cardiovascular disease from 11 routine clinical measurements in under a minute.",
    icon: HeartPulse,
    tile: "bg-tile-pink text-tile-pink-icon",
  },
  {
    title: "Explainable results",
    text: "Every result shows which values pushed the estimate up or down, and how reliable the model has proven to be.",
    icon: Lightbulb,
    tile: "bg-tile-blue text-tile-blue-icon",
  },
  {
    title: "High-risk follow-up",
    text: "High-risk results open a case that must be acknowledged and closed. Cases left unattended are escalated automatically.",
    icon: ShieldAlert,
    tile: "bg-tile-violet text-tile-violet-icon",
  },
  {
    title: "Email & SMS alerts",
    text: "The responsible clinician and the administrators are alerted within seconds, so patients can be reviewed promptly.",
    icon: BellRing,
    tile: "bg-tile-mint text-tile-mint-icon",
  },
  {
    title: "Local validation",
    text: "Confirmed diagnoses are recorded so the model's accuracy can be measured on St. Mary's own patients over time.",
    icon: ClipboardCheck,
    tile: "bg-tile-pink text-tile-pink-icon",
  },
  {
    title: "Secure by design",
    text: "Staff-only accounts, two-factor sign-in for administrators, patients identified by folder number and a full audit trail.",
    icon: LockKeyhole,
    tile: "bg-tile-blue text-tile-blue-icon",
  },
];

const STEPS = [
  {
    title: "Enter the assessment",
    text: "A clinician enters the patient's folder number and 11 routine measurements – age, blood pressure, cholesterol, ECG and exercise-test findings. Missing cholesterol is handled and flagged.",
    icon: ClipboardList,
  },
  {
    title: "Review the estimate",
    text: "The model returns the probability of cardiovascular disease, a low / moderate / high risk band, the factors behind it and the model's tested sensitivity and specificity.",
    icon: Gauge,
  },
  {
    title: "Act and follow up",
    text: "High-risk results open a follow-up case and alert the team. Once the diagnosis is confirmed, the outcome is recorded to keep measuring accuracy at the hospital.",
    icon: Route,
  },
];

const GALLERY = [
  { src: dashboardShot, alt: "CVD Support dashboard with today's assessments and high-risk follow-ups", caption: "Dashboard" },
  { src: assessmentShot, alt: "Assessment result with follow-up case, probability gauge and explanation", caption: "Assessment & follow-up" },
  { src: modelShot, alt: "Model performance with threshold analysis and decision curve", caption: "Model performance" },
];

function SectionTitle({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-12">
      <h2 className="text-[28px] font-medium tracking-tight text-primary sm:text-[32px]">{children}</h2>
      {sub && <p className="mt-3 text-[15px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default async function LandingPage() {
  const jar = await cookies();
  const signedIn = jar.has("better-auth.session_token") || jar.has("__Secure-better-auth.session_token");
  const cta = signedIn ? { href: "/dashboard", label: "Open dashboard" } : { href: "/login", label: "Staff sign in" };

  return (
    <div id="top" className="min-h-svh bg-background">
      <LandingHeader signedIn={signedIn} />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-tile-pink/70 via-background to-background" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:grid-cols-2 md:py-20">
          <div className="text-center md:text-left">
            <span className="mb-5 hidden items-center gap-2 rounded-full sm:inline-flex border border-primary/20 bg-card px-3.5 py-1.5 text-[13px] font-medium text-foreground/85 shadow-sm">
              <Hospital className="size-4 text-primary" /> St. Mary&apos;s Hospital, Drobo
            </span>
            <h1 className="text-[34px] font-medium leading-tight tracking-tight text-primary sm:text-[44px]">
              Cardiovascular Risk Prediction
            </h1>
            <p className="mt-2 text-[22px] text-foreground/85 sm:text-[26px]">Support you can act on</p>
            <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-muted-foreground md:mx-0">
              A decision-support tool for the clinicians of St. Mary&apos;s Hospital, Drobo – estimate the likelihood of cardiovascular disease, see why, and
              make sure every high-risk patient is followed up.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3 md:justify-start">
              <Link
                href={cta.href}
                className="rounded-full bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/30 transition-opacity hover:opacity-90"
              >
                {cta.label}
              </Link>
              <a href="#how-it-works" className="rounded-full border border-primary/30 bg-card px-6 py-2.5 text-sm font-medium text-primary hover:bg-accent">
                How it works
              </a>
            </div>
          </div>
          <HeroArt />
        </div>
      </section>

      {/* ── Content panel ────────────────────────────────── */}
      <main className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <div className="rounded-3xl bg-card px-5 shadow-[0_1px_2px_rgb(30_27_75/0.04),0_8px_32px_-12px_rgb(30_27_75/0.12)] sm:px-10">
          {/* Features (template: "Our Specialities") */}
          <section id="features" className="scroll-mt-20 py-16">
            <SectionTitle sub="Everything a clinical team needs to go from measurement to follow-up.">What the system does</SectionTitle>
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-8 sm:gap-y-12 lg:grid-cols-3">
              {FEATURES.map((f) => (
                <article key={f.title} className="text-center">
                  <div className={`mx-auto flex size-24 items-center justify-center rounded-2xl sm:size-32 ${f.tile}`}>
                    <f.icon className="size-10 sm:size-14" strokeWidth={1.4} />
                  </div>
                  <h3 className="mt-4 text-[15px] font-medium sm:mt-5 sm:text-[17px]">{f.title}</h3>
                  <p className="mx-auto mt-2 max-w-xs text-[12px] leading-relaxed text-muted-foreground sm:text-[13px]">{f.text}</p>
                </article>
              ))}
            </div>
          </section>

          {/* How it works (template: "Facilities & Infrastructure") */}
          <section id="how-it-works" className="scroll-mt-20 border-t py-16">
            <SectionTitle>How it works</SectionTitle>
            <div className="grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <article key={s.title} className="rounded-2xl border px-6 py-8 text-center transition-shadow hover:shadow-md">
                  <div className="mx-auto flex size-12 items-center justify-center text-primary">
                    <s.icon className="size-9" strokeWidth={1.6} />
                  </div>
                  <h3 className="mt-4 text-[17px] font-medium">
                    <span className="text-primary">{i + 1}.</span> {s.title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{s.text}</p>
                </article>
              ))}
            </div>
          </section>

          {/* About */}
          <section id="about" className="scroll-mt-20 border-t py-16">
            <SectionTitle>About the project</SectionTitle>
            <AboutArt />
            <p className="mx-auto mt-8 max-w-3xl text-center text-[15px] leading-relaxed text-muted-foreground">
              CVD Support is a web-based decision-support application developed for St. Mary&apos;s Hospital, Drobo. It applies a Random Forest model –
              trained on 1,000 patient records and tested on an independent dataset of 918 patients – to help authorised clinicians identify patients who may
              have cardiovascular disease and follow them up promptly. Results support, and never replace, clinical judgement: the system does not diagnose, and
              its accuracy is being measured on the hospital&apos;s own patients before clinical reliance.
            </p>
            <div className="mx-auto mt-8 flex max-w-3xl flex-wrap justify-center gap-2">
              {["Decision support, not diagnosis", "Authorised staff only", "Data Protection Act 2012 (Act 843)", "Every action audited"].map((t) => (
                <span key={t} className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
                  {t}
                </span>
              ))}
            </div>
          </section>

          {/* Gallery */}
          <section id="gallery" className="scroll-mt-20 border-t py-16">
            <SectionTitle>Gallery</SectionTitle>
            <div className="grid gap-5 md:grid-cols-3">
              {GALLERY.map((g) => (
                <figure key={g.caption} className="group">
                  <div className="overflow-hidden rounded-2xl border bg-muted shadow-sm">
                    <Image
                      src={g.src}
                      alt={g.alt}
                      placeholder="blur"
                      sizes="(min-width: 768px) 33vw, 100vw"
                      className="aspect-[16/10] w-full object-cover object-left-top transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <figcaption className="mt-2 text-center text-[13px] text-muted-foreground">{g.caption}</figcaption>
                </figure>
              ))}
            </div>
            <p className="mt-4 text-center text-xs text-muted-foreground">Screens shown with demonstration data.</p>
          </section>
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer className="border-t bg-card">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-center sm:px-6 md:flex-row md:text-left">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Stethoscope className="size-4" />
            </span>
            <span className="text-sm">
              <span className="font-semibold">St. Mary&apos;s Hospital, Drobo</span>
              <span className="text-muted-foreground"> · Cardiovascular Disease Support · © {new Date().getFullYear()}</span>
            </span>
          </div>
          <p className="max-w-md text-xs text-muted-foreground">
            Decision-support tool · not a diagnosis · not clinically validated at this hospital. For authorised hospital staff only.
          </p>
          <Link href={cta.href} className="text-sm font-medium text-primary hover:underline">
            {cta.label} →
          </Link>
        </div>
      </footer>
    </div>
  );
}
