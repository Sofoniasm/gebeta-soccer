"use client";

import { PROP_INFO, propsFromScore, type HtResult, type PropKey, type PropPick } from "@/lib/challenge-props";

/**
 * The answers that will be sent: an unanswered "both teams to score" or
 * "over/under" follows the score pick (2-1 → Yes, Over). Half-time must be chosen.
 */
export function effectivePropPick(value: PropPick, home: string, away: string): PropPick {
  const hasScore = home !== "" && away !== "";
  const d = hasScore ? propsFromScore(Number(home), Number(away)) : null;
  return {
    btts: typeof value.btts === "boolean" ? value.btts : d?.btts ?? null,
    over25: typeof value.over25 === "boolean" ? value.over25 : d?.over25 ?? null,
    ht: value.ht ?? null,
  };
}

function Seg<T extends string | boolean>({ options, value, onPick }: { options: [T, string][]; value: T | null | undefined; onPick: (v: T) => void }) {
  return (
    <div className="flex gap-1">
      {options.map(([v, label]) => (
        <button
          key={String(v)}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onPick(v);
          }}
          onKeyDown={(e) => e.stopPropagation()}
          className={`min-w-0 flex-1 truncate rounded-full border px-2.5 py-1.5 text-[11px] font-bold transition ${
            value === v ? "border-lilac bg-lilac/25 text-white" : "border-white/10 text-mist hover:border-white/25"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Extra-pick buttons for one match. */
export function PropPicker({
  props,
  value,
  home,
  away,
  homeTeam,
  awayTeam,
  onChange,
}: {
  props: PropKey[];
  value: PropPick;
  home: string;
  away: string;
  homeTeam: string;
  awayTeam: string;
  onChange: (v: PropPick) => void;
}) {
  if (props.length === 0) return null;
  const eff = effectivePropPick(value, home, away);
  return (
    <div className="mt-3 space-y-2 border-t border-white/5 pt-3" onClick={(e) => e.stopPropagation()}>
      {props.includes("btts") && (
        <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
          <span className="text-[11px] font-semibold text-mist">{PROP_INFO.btts.label}</span>
          <Seg<boolean> options={[[true, "Yes"], [false, "No"]]} value={eff.btts} onPick={(v) => onChange({ ...value, btts: v })} />
        </div>
      )}
      {props.includes("ou25") && (
        <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
          <span className="text-[11px] font-semibold text-mist">Goals (2.5)</span>
          <Seg<boolean> options={[[true, "Over"], [false, "Under"]]} value={eff.over25} onPick={(v) => onChange({ ...value, over25: v })} />
        </div>
      )}
      {props.includes("ht") && (
        <div className="grid grid-cols-[7.5rem_1fr] items-center gap-2">
          <span className="text-[11px] font-semibold text-mist">{PROP_INFO.ht.label}</span>
          <Seg<HtResult> options={[["H", homeTeam], ["D", "Draw"], ["A", awayTeam]]} value={eff.ht} onPick={(v) => onChange({ ...value, ht: v })} />
        </div>
      )}
    </div>
  );
}
