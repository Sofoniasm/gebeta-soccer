/** Shown instantly while the next page loads, so a tap never feels ignored. */
export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-mist">
        <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-lilac" />
        <span className="text-xs font-bold uppercase tracking-widest">Loading…</span>
      </div>
    </div>
  );
}
