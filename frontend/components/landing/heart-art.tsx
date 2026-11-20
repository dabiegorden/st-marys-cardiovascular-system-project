import { BellRing, ClipboardList } from "lucide-react";

const HEART = "M100 178 C 40 135, 12 100, 12 66 C 12 38, 34 18, 60 18 C 78 18, 92 28, 100 42 C 108 28, 122 18, 140 18 C 166 18, 188 38, 188 66 C 188 100, 160 135, 100 178 Z";

function Heart({ id, className }: { id: string; className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: "var(--step-1-to)" }} />
          <stop offset="55%" style={{ stopColor: "var(--primary)" }} />
          <stop offset="100%" style={{ stopColor: "var(--step-3-from)" }} />
        </linearGradient>
      </defs>
      <path d={HEART} fill={`url(#${id}-fill)`} />
      <ellipse cx="62" cy="58" rx="26" ry="16" fill="white" opacity="0.28" transform="rotate(-28 62 58)" />
      <polyline
        points="18,104 70,104 82,82 94,130 108,70 120,112 128,104 182,104"
        fill="none"
        stroke="white"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.95"
      />
    </svg>
  );
}

/** Hero visual: brand heart with an ECG trace and two product "moments". */
export function HeroArt() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <div className="absolute inset-[6%] rounded-full bg-tile-pink" />
      <div className="absolute right-[2%] top-[4%] size-[38%] rounded-full bg-tile-violet opacity-80" />
      <div className="absolute bottom-[6%] left-[2%] size-[28%] rounded-full bg-tile-blue opacity-80" />
      <Heart id="hero" className="absolute inset-[16%] drop-shadow-[0_24px_40px_rgba(226,69,106,0.35)]" />

      <div className="absolute left-0 top-[12%] w-[44%] min-w-32 rounded-2xl bg-card p-3 shadow-[0_12px_32px_-8px_rgb(30_27_75/0.25)] sm:p-4">
        <div className="text-[11px] text-muted-foreground">Estimated probability</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums sm:text-3xl">87%</div>
        <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-risk-high/30 bg-risk-high-soft px-2 py-0.5 text-[11px] font-semibold text-risk-high">
          <span className="size-1.5 rounded-full bg-current" /> High risk
        </span>
      </div>

      <div className="absolute bottom-[8%] right-0 flex w-[54%] min-w-40 items-center gap-2.5 rounded-2xl bg-card p-3 shadow-[0_12px_32px_-8px_rgb(30_27_75/0.25)]">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-tile-mint-icon text-white sm:size-10">
          <BellRing className="size-4 sm:size-5" />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-semibold">Follow-up opened</div>
          <div className="truncate text-[11px] text-muted-foreground">Email &amp; SMS sent</div>
        </div>
      </div>

      <div className="absolute bottom-[34%] left-[2%] hidden items-center gap-2 rounded-full bg-card px-3 py-1.5 text-[11px] font-medium shadow-md sm:flex">
        <ClipboardList className="size-3.5 text-primary" /> 11 routine measurements
      </div>
    </div>
  );
}

/** About visual: heart on an ECG line (mirrors the template's about image). */
export function AboutArt() {
  return (
    <div className="relative mx-auto h-44 w-full max-w-xl sm:h-52">
      <svg viewBox="0 0 560 200" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="xMidYMid meet">
        <polyline
          points="0,112 200,112 222,112 240,80 262,150 290,40 316,140 338,98 352,112 520,112"
          fill="none"
          style={{ stroke: "var(--series-1)" }}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.75"
        />
        <circle cx="524" cy="112" r="6" style={{ fill: "var(--series-1)" }} />
        <line x1="0" y1="112" x2="200" y2="112" style={{ stroke: "var(--series-1)" }} strokeWidth="3" opacity="0.25" />
      </svg>
      <Heart id="about" className="absolute left-1/2 top-1/2 h-[92%] -translate-x-[62%] -translate-y-1/2 drop-shadow-[0_18px_30px_rgba(226,69,106,0.3)]" />
    </div>
  );
}
