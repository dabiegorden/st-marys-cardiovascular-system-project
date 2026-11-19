import { HeartPulse } from "lucide-react";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-svh grid lg:grid-cols-2">
      <section className="hidden lg:flex flex-col justify-between bg-primary text-primary-foreground p-10">
        <div className="flex items-center gap-2 font-semibold">
          <HeartPulse className="size-6" />
          St. Mary&apos;s Hospital, Drobo
        </div>
        <div className="max-w-md space-y-4">
          <h1 className="text-3xl font-semibold leading-tight">Cardiovascular disease prediction support</h1>
          <p className="text-primary-foreground/80">
            A Random Forest model estimates the likelihood of cardiovascular disease from routine clinical
            measurements, to support – never replace – clinical judgement.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">
          Authorised hospital staff only. All activity is recorded in an audit log.
        </p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">{children}</div>
      </section>
    </main>
  );
}
