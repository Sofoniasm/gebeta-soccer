"use client";

/**
 * Score box with ▲ / ▼ buttons. Tap to change by one; typing still works.
 * Clicks never reach a parent card (the challenge builder card toggles on click).
 */
export function ScoreStepper({
  value,
  label,
  disabled = false,
  max = 15,
  onChange,
}: {
  value: string;
  label: string;
  disabled?: boolean;
  max?: number;
  onChange: (v: string) => void;
}) {
  const n = value === "" ? null : Number(value);
  const step = (d: number) => {
    if (n === null) return onChange("0"); // first tap on an empty box sets 0
    onChange(String(Math.min(max, Math.max(0, n + d))));
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const btn =
    "flex h-7 w-12 items-center justify-center rounded-xl text-sm text-mist transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-30";
  return (
    <div className="flex flex-col items-center gap-1" onClick={stop} onKeyDown={stop}>
      <button type="button" aria-label={`${label}: one more`} disabled={disabled || n === max} onClick={() => step(1)} className={btn}>
        ▲
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          onChange(digits === "" ? "" : String(Math.min(max, Number(digits))));
        }}
        onFocus={(e) => e.target.select()}
        placeholder="–"
        className="h-12 w-12 rounded-2xl border border-white/15 bg-ink text-center text-xl font-extrabold text-white outline-none transition focus:border-lilac focus:ring-2 focus:ring-lilac/25 disabled:border-transparent disabled:bg-white/5 disabled:text-mist"
      />
      <button type="button" aria-label={`${label}: one less`} disabled={disabled || n === null || n === 0} onClick={() => step(-1)} className={btn}>
        ▼
      </button>
    </div>
  );
}
