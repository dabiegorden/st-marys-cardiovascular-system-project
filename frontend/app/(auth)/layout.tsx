import { HeartPulse, ShieldCheck, Stethoscope, BarChart3 } from "lucide-react";

const POINTS = [
  { icon: Stethoscope, text: "Random Forest estimate from 11 routine clinical measurements" },
  { icon: BarChart3, text: "Tested on an independent external dataset – limits shown on every result" },
  { icon: ShieldCheck, text: "Authorised staff only · patients identified by folder number · all activity audited" },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-4">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-3xl bg-card shadow-[0_8px_40px_-12px_rgb(30_27_75/0.18)] lg:grid-cols-2">
        <section className="hidden flex-col justify-between bg-gradient-to-br from-[var(--step-1-from)] to-[var(--step-3-from)] p-10 text-white lg:flex">
          <div className="flex items-center gap-2 font-semibold">
            <span className="flex size-8 items-center justify-center rounded-lg bg-white/20">
              <HeartPulse className="size-4.5" />
            </span>
            CVD Support
          </div>
          <div className="space-y-5">
            <h1 className="text-[26px] font-semibold leading-tight">
              Cardiovascular disease prediction support
            </h1>
            <ul className="space-y-3 text-sm text-white/90">
              {POINTS.map((p) => (
                <li key={p.text} className="flex gap-3">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20">
                    <p.icon className="size-3.5" />
                  </span>
                  <span className="pt-1">{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-white/75">Saint Mary&apos;s Hospital, Drobo</p>
        </section>
        <section className="flex items-center justify-center px-6 py-12 sm:px-12">
          <div className="w-full max-w-sm">{children}</div>
        </section>
      </div>
    </main>
  );
}
