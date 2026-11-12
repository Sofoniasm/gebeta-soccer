"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { placeSlip, updateSlip, type ActionResult } from "./actions";
import { formatKickoff } from "@/lib/format";
import { calculateMatchPoints } from "@/lib/scoring";
import type { MatchRow } from "@/lib/rounds";
import { Banner, primaryButtonClass } from "@/components/ui";
import { CheckIcon, ClockIcon, LockIcon, SpinnerIcon } from "@/components/icons";
import { FormBar } from "@/components/FormBar";
import type { Chances, FormMap } from "@/lib/form";

export interface SlipData {
  id: number;
  slip_no: number;
  picks: Record<number, { home: number; away: number; points: number | null }>;
}

interface Props {
  roundId: number;
  bettable: boolean; // round open and before the first kickoff
  entryFeeUnits: number;
  entryFeeLabel: string;
  balanceUnits: number;
  matches: MatchRow[];
  slips: SlipData[];
  /** Last 5 results per team name. */
  form?: FormMap;
  /** Premium only: rough result chances per match id. */
  chances?: Record<number, Chances>;
}

type Draft = Record<number, { home: string; away: string }>;
const NEW = "new" as const;

function Crest({ src, name }: { src: string | null; name: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-9 w-9 object-contain" loading="lazy" />
  ) : (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold">{name.slice(0, 2).toUpperCase()}</div>
  );
}

const MAX_GOALS = 15;

/** Score box with ▲ / ▼ buttons (0–15). Tap to change; typing still works. */
function ScoreInput(props: { value: string; disabled: boolean; label: string; onChange: (v: string) => void }) {
  const n = props.value === "" ? null : Number(props.value);
  const step = (d: number) => {
    const next = n === null ? (d > 0 ? 0 : 0) : Math.min(MAX_GOALS, Math.max(0, n + d));
    props.onChange(String(n === null && d > 0 ? 0 : next));
  };
  const btn =
    "flex h-7 w-14 items-center justify-center rounded-xl text-sm text-mist transition hover:bg-white/10 hover:text-white active:scale-95 disabled:opacity-30";
  return (
    <div className="flex flex-col items-center gap-1">
      <button type="button" aria-label={`${props.label}: one more`} disabled={props.disabled || n === MAX_GOALS} onClick={() => step(1)} className={btn}>
        ▲
      </button>
      <input
        aria-label={props.label}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={2}
        value={props.value}
        disabled={props.disabled}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
          const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
          props.onChange(digits === "" ? "" : String(Math.min(MAX_GOALS, Number(digits))));
        }}
        onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
        className="h-12 w-14 rounded-2xl border border-white/15 bg-ink text-center text-2xl font-extrabold text-white outline-none transition focus:border-lilac focus:ring-2 focus:ring-lilac/25 disabled:border-transparent disabled:bg-white/5 disabled:text-mist"
        placeholder="–"
      />
      <button type="button" aria-label={`${props.label}: one less`} disabled={props.disabled || n === null || n === 0} onClick={() => step(-1)} className={btn}>
        ▼
      </button>
    </div>
  );
}

const draftFrom = (matches: MatchRow[], slip?: SlipData): Draft => {
  const d: Draft = {};
  for (const m of matches) {
    const p = slip?.picks[m.id];
    d[m.id] = { home: p ? String(p.home) : "", away: p ? String(p.away) : "" };
  }
  return d;
};

/**
 * The betting slip: 10 matches, one score each. A player can place several
 * slips (each paid separately) and edit them for free until the first kickoff.
 */
export default function PredictionBoard({ roundId, bettable, entryFeeUnits, entryFeeLabel, balanceUnits, matches, slips, form = {}, chances }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<number | typeof NEW>(slips.length ? slips[0].id : NEW);
  const slip = useMemo(() => slips.find((s) => s.id === selected), [slips, selected]);
  const [draft, setDraft] = useState<Draft>(() => draftFrom(matches, slip));
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  // switching slips loads that slip's scores
  useEffect(() => {
    setDraft(draftFrom(matches, slip));
  }, [selected, slip, matches]);

  // re-render every 15 s so the slip locks at the first kickoff without a refresh
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  const firstKickoff = Math.min(...matches.filter((m) => !["postponed", "cancelled"].includes(m.status)).map((m) => new Date(m.kickoff_at).getTime()));
  const open = bettable && Date.now() < firstKickoff;

  const picked = matches.filter((m) => draft[m.id]?.home !== "" && draft[m.id]?.away !== "").length;
  const complete = picked === matches.length && matches.length === 10;
  const changed = slip
    ? matches.some((m) => {
        const p = slip.picks[m.id];
        return !p || String(p.home) !== draft[m.id]?.home || String(p.away) !== draft[m.id]?.away;
      })
    : picked > 0;
  const canAfford = balanceUnits >= entryFeeUnits;

  function update(id: number, side: "home" | "away", v: string) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [side]: v } }));
    setResult(null);
  }
  const picks = () => matches.map((m) => ({ matchId: m.id, home: Number(draft[m.id].home), away: Number(draft[m.id].away) }));

  function onPlace() {
    startTransition(async () => {
      const r = await placeSlip(roundId, picks());
      setResult(r);
      if (r.ok) router.refresh();
    });
  }
  function onSave() {
    if (!slip) return;
    startTransition(async () => {
      const r = await updateSlip(slip.id, picks());
      setResult(r);
      if (r.ok) router.refresh();
    });
  }
  function copyFrom(s: SlipData) {
    setDraft(draftFrom(matches, s));
    setResult(null);
  }

  // after a new slip is placed, jump to it
  useEffect(() => {
    if (result?.ok && result.slipNo) {
      const placed = slips.find((s) => s.slip_no === result.slipNo);
      if (placed) setSelected(placed.id);
    }
  }, [slips, result]);

  const total = slip ? Object.values(slip.picks).reduce((s, p) => s + Number(p.points ?? 0), 0) : 0;

  return (
    <div className="space-y-4 pb-28">
      {/* Slip tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {slips.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s.id)}
            className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition ${
              selected === s.id ? "bg-lilac text-ink" : "border border-white/15 text-mist hover:text-white"
            }`}
          >
            🎟️ Slip #{s.slip_no}
          </button>
        ))}
        {open && (
          <button
            onClick={() => setSelected(NEW)}
            className={`rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wider transition ${
              selected === NEW ? "bg-emerald-300 text-ink" : "border border-dashed border-emerald-300/50 text-emerald-200 hover:bg-emerald-300/10"
            }`}
          >
            + {slips.length ? "New slip" : "Your first slip"}
          </button>
        )}
      </div>

      {selected === NEW && open && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm">
          <p className="text-mist">
            Fill in all <b className="text-white">10 scores</b>, then place your bet for <b className="text-white">{entryFeeLabel}</b>. You can edit it free until the first kickoff. No refunds once placed.
          </p>
          {slips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {slips.map((s) => (
                <button key={s.id} onClick={() => copyFrom(s)} className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-mist hover:text-white">
                  Copy Slip #{s.slip_no}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {result && <Banner kind={result.ok ? "success" : "error"}>{result.message}</Banner>}

      {matches.length !== 10 && <p className="rounded-2xl border border-white/10 p-6 text-center text-mist">The 10 matches for this round will appear soon.</p>}

      {!open && slips.length === 0 && (
        <p className="rounded-2xl border border-white/10 p-6 text-center text-mist">
          <LockIcon size={16} className="mr-1 inline" /> Betting for this round is closed.
        </p>
      )}

      {(selected === NEW ? open : !!slip) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {matches.map((m, i) => {
            const finished = m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null;
            const p = slip?.picks[m.id];
            const points =
              p?.points ?? (finished && p ? calculateMatchPoints(p.home, p.away, m.actual_home_score!, m.actual_away_score!) : null);
            const filled = draft[m.id]?.home !== "" && draft[m.id]?.away !== "";
            return (
              <div key={m.id} className={`rounded-3xl border p-4 transition ${filled ? "border-lilac/25 bg-card/70" : "border-white/[0.06] bg-card/50"}`}>
                <div className="mb-3 flex items-center justify-between text-xs text-mist">
                  <span className="flex items-center gap-1.5">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-extrabold text-white">{i + 1}</span>
                    <ClockIcon size={14} /> {formatKickoff(m.kickoff_at)}
                  </span>
                  {m.status === "live" && <span className="rounded-full bg-rose-400/20 px-2 py-0.5 font-semibold text-rose-200">LIVE</span>}
                  {m.status === "postponed" && <span className="text-lilac-soft">Postponed</span>}
                  {!open && m.status === "scheduled" && (
                    <span className="flex items-center gap-1">
                      <LockIcon size={12} /> Locked
                    </span>
                  )}
                  {open && filled && <CheckIcon size={14} className="text-lilac" />}
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                    <Crest src={m.home_crest} name={m.home_team} />
                    <span className="w-full truncate text-sm font-semibold">{m.home_team}</span>
                    <FormBar team={m.home_team} form={form[m.home_team]} />
                  </div>
                  <div className="flex items-center gap-2">
                    <ScoreInput label={`${m.home_team} score`} value={draft[m.id]?.home ?? ""} disabled={!open} onChange={(v) => update(m.id, "home", v)} />
                    <span className="text-mist/70">:</span>
                    <ScoreInput label={`${m.away_team} score`} value={draft[m.id]?.away ?? ""} disabled={!open} onChange={(v) => update(m.id, "away", v)} />
                  </div>
                  <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                    <Crest src={m.away_crest} name={m.away_team} />
                    <span className="w-full truncate text-sm font-semibold">{m.away_team}</span>
                    <FormBar team={m.away_team} form={form[m.away_team]} />
                  </div>
                </div>
                {chances?.[m.id] && (
                  <p className="mt-2 text-center text-[11px] text-mist" title="Rough guide from each team's last 5 results and home advantage. Not a prediction.">
                    ⭐ Form guide: <b className="text-white">{m.home_team} {chances[m.id].home}%</b> · Draw {chances[m.id].draw}% ·{" "}
                    <b className="text-white">{m.away_team} {chances[m.id].away}%</b>
                  </p>
                )}

                {finished && (
                  <div className="mt-3 flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm">
                    <span className="text-mist">
                      Final: <b className="text-white">{m.actual_home_score} – {m.actual_away_score}</b>
                    </span>
                    {points !== null && (
                      <span className={`font-bold ${Number(points) >= 3 ? "text-lilac-soft" : Number(points) > 0 ? "text-lilac" : "text-mist/70"}`}>
                        +{Number(points)} pts
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {slip && !open && Object.values(slip.picks).some((p) => p.points !== null) && (
        <p className="pt-2 text-center text-sm text-mist">
          Slip #{slip.slip_no} total: <b className="text-white">{total} pts</b> (plus Slam Points)
        </p>
      )}

      {/* Betting slip bar */}
      {open && (selected === NEW || slip) && matches.length === 10 && (
        <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-white/10 bg-[#0b0912]/90 p-3 backdrop-blur-xl lg:bottom-0 lg:left-72 lg:p-4">
          <div className="mx-auto flex max-w-2xl items-center gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">{selected === NEW ? "New slip" : `Slip #${slip?.slip_no}`}</p>
              <p className="text-sm font-extrabold">
                {picked}/10 picked
                {selected === NEW && <span className="ml-1.5 text-xs font-bold text-mist">· costs {entryFeeLabel}</span>}
                {selected !== NEW && changed && <span className="ml-1.5 text-xs font-bold text-amber-200">· unsaved changes</span>}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
                <div className={`h-full rounded-full transition-all ${complete ? "bg-emerald-300" : "bg-lilac"}`} style={{ width: `${picked * 10}%` }} />
              </div>
            </div>
            {selected === NEW ? (
              canAfford ? (
                <button onClick={onPlace} disabled={pending || !complete} className={`${primaryButtonClass.replace("w-full ", "")} shrink-0`}>
                  {pending && <SpinnerIcon size={18} />} {complete ? "Place bet" : `${10 - picked} to go`}
                </button>
              ) : (
                <a href="/wallet" className={`${primaryButtonClass.replace("w-full ", "")} shrink-0`}>
                  Top up
                </a>
              )
            ) : (
              <button onClick={onSave} disabled={pending || !changed || !complete} className={`${primaryButtonClass.replace("w-full ", "")} shrink-0`}>
                {pending && <SpinnerIcon size={18} />} {changed ? "Save changes" : "Saved ✓"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
