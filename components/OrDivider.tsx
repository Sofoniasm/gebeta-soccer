export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-mist/70">
      <span className="h-px flex-1 bg-white/10" /> {label} <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
