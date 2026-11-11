// Shared UI pieces — plum & lavender theme.
export { Logo, LogoMark, Wordmark } from "./Logo";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-3xl border border-white/[0.06] bg-card/60 p-5 ${className}`}>{children}</div>;
}

export function Banner({ kind, children }: { kind: "success" | "error"; children: React.ReactNode }) {
  const styles =
    kind === "success"
      ? "border-emerald-300/25 bg-emerald-300/10 text-emerald-100"
      : "border-rose-300/30 bg-rose-400/10 text-rose-100";
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

/** "INTRODUCTION / TO GEBETASOCCER →" style section heading. */
export function SectionTitle({ top, bottom, className = "" }: { top: string; bottom: string; className?: string }) {
  return (
    <div className={className}>
      <p className="text-2xl font-extrabold uppercase tracking-wide text-white sm:text-3xl">{top}</p>
      <p className="mt-1 flex items-center gap-4 text-xl font-light uppercase tracking-wide text-lilac-soft sm:text-2xl">
        {bottom}
        <svg viewBox="0 0 90 12" className="h-3 w-20 shrink-0 text-lilac" aria-hidden="true">
          <path d="M0 6h86M80 1l6 5-6 5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </p>
    </div>
  );
}

export const inputClass =
  "w-full rounded-2xl border border-white/10 bg-ink/70 px-4 py-3 text-base text-white placeholder:text-mist/60 outline-none transition focus:border-lilac focus:ring-2 focus:ring-lilac/25";

export const primaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-full bg-lilac px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink shadow-lg shadow-lilac/20 transition hover:bg-lilac-soft active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-full border border-white/60 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50";
