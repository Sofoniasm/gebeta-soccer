// Small shared UI pieces.
import Link from "next/link";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`text-xl font-black tracking-tight ${className}`}>
      Gebeta<span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">Soccer</span>
    </Link>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur ${className}`}>
      {children}
    </div>
  );
}

export function Banner({ kind, children }: { kind: "success" | "error"; children: React.ReactNode }) {
  const styles =
    kind === "success"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
      : "border-red-500/30 bg-red-500/10 text-red-200";
  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}

export const inputClass =
  "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white placeholder:text-neutral-500 outline-none transition focus:border-emerald-400 focus:ring-2 focus:ring-emerald-400/30";

export const primaryButtonClass =
  "inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-3.5 text-base font-bold text-neutral-950 shadow-lg shadow-emerald-500/20 transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 active:scale-[0.98] disabled:opacity-50";
