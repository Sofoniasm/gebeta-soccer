"use client";

import { useMemo, useState, useTransition } from "react";
import { joinRound, savePredictions, type ActionResult } from "./actions";
import { formatKickoff } from "@/lib/format";
import { calculateMatchPoints } from "@/lib/scoring";
import type { MatchRow } from "@/lib/rounds";
import { Banner, primaryButtonClass } from "@/components/ui";
import { CheckIcon, ClockIcon, LockIcon, SpinnerIcon } from "@/components/icons";

export interface SavedPrediction {
  match_id: number;
  predicted_home_score: number;
  predicted_away_score: number;
  points_earned: number | null;
}

interface Props {
  roundId: number;
  roundOpen: boolean;
  entered: boolean;
  entryFeeLabel: string;
  matches: MatchRow[];
  saved: SavedPrediction[];
}

type Draft = Record<number, { home: string; away: string }>;

const isOpen = (m: MatchRow) => m.status === "scheduled" && new Date(m.kickoff_at).getTime() > Date.now();

function Crest({ src, name }: { src: string | null; name: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="h-8 w-8 object-contain" loading="lazy" />
  ) : (
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold">
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function ScoreInput(props: { value: string; disabled: boolean; label: string; onChange: (v: string) => void }) {
  return (
    <input
      aria-label={props.label}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={props.value}
      disabled={props.disabled}
      onChange={(e: React.ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onFocus={(e: React.FocusEvent<HTMLInputElement>) => e.target.select()}
      className="h-12 w-12 rounded-xl border border-white/15 bg-ink text-center text-xl font-bold text-white outline-none transition focus:border-lilac focus:ring-2 focus:ring-lilac/25 disabled:border-transparent disabled:bg-white/5 disabled:text-mist"
      placeholder="–"
    />
  );
}

export default function PredictionBoard({ roundId, roundOpen, entered, entryFeeLabel, matches, saved }: Props) {
  const savedByMatch = useMemo(() => new Map(saved.map((s) => [s.match_id, s])), [saved]);

  const [draft, setDraft] = useState<Draft>(() => {
    const d: Draft = {};
    for (const m of matches) {
      const s = savedByMatch.get(m.id);
      d[m.id] = { home: s ? String(s.predicted_home_score) : "", away: s ? String(s.predicted_away_score) : "" };
    }
    return d;
  });
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  const canEdit = roundOpen && entered;
  const editable = matches.filter((m) => canEdit && isOpen(m));

  const changed = editable.filter((m) => {
    const d = draft[m.id];
    const s = savedByMatch.get(m.id);
    if (d.home === "" || d.away === "") return false;
    return !s || String(s.predicted_home_score) !== d.home || String(s.predicted_away_score) !== d.away;
  });

  const totalPoints = saved.reduce((sum, s) => sum + Number(s.points_earned ?? 0), 0);

  function update(id: number, side: "home" | "away", v: string) {
    setDraft((prev) => ({ ...prev, [id]: { ...prev[id], [side]: v } }));
    setResult(null);
  }

  function onSave() {
    const payload = changed.map((m) => ({
      matchId: m.id,
      home: Number(draft[m.id].home),
      away: Number(draft[m.id].away),
    }));
    startTransition(async () => setResult(await savePredictions(payload)));
  }

  function onJoin() {
    startTransition(async () => setResult(await joinRound(roundId)));
  }

  return (
    <div className="space-y-3 pb-28">
      {result && <Banner kind={result.ok ? "success" : "error"}>{result.message}</Banner>}

      {!entered && roundOpen && (
        <div className="rounded-2xl border border-lilac/25 bg-gradient-to-br from-lilac/15 to-transparent p-5">
          <p className="text-lg font-bold">Join this round</p>
          <p className="mt-1 text-sm text-mist">Entry: {entryFeeLabel}. Predict all matches and win the pot.</p>
          <button onClick={onJoin} disabled={pending} className={`${primaryButtonClass} mt-4`}>
            {pending && <SpinnerIcon size={18} />} Join round
          </button>
        </div>
      )}

      {matches.length === 0 && (
        <p className="rounded-2xl border border-white/10 p-6 text-center text-mist">
          Matches for this round will appear soon.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
      {matches.map((m) => {
        const s = savedByMatch.get(m.id);
        const open = canEdit && isOpen(m);
        const finished = m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null;
        const points =
          s?.points_earned ??
          (finished && s
            ? calculateMatchPoints(s.predicted_home_score, s.predicted_away_score, m.actual_home_score!, m.actual_away_score!)
            : null);

        return (
          <div key={m.id} className="rounded-3xl border border-white/[0.06] bg-card/60 p-4">
            <div className="mb-3 flex items-center justify-between text-xs text-mist">
              <span className="flex items-center gap-1.5">
                <ClockIcon size={14} /> {formatKickoff(m.kickoff_at)}
              </span>
              {m.status === "live" && <span className="rounded-full bg-rose-400/20 px-2 py-0.5 font-semibold text-rose-200">LIVE</span>}
              {m.status === "postponed" && <span className="text-lilac-soft">Postponed</span>}
              {!open && m.status === "scheduled" && (
                <span className="flex items-center gap-1"><LockIcon size={12} /> Locked</span>
              )}
              {s && open && <span className="flex items-center gap-1 text-lilac"><CheckIcon size={14} /> Saved</span>}
            </div>

            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <Crest src={m.home_crest} name={m.home_team} />
                <span className="w-full truncate text-sm font-semibold">{m.home_team}</span>
              </div>

              <div className="flex items-center gap-2">
                <ScoreInput label={`${m.home_team} score`} value={draft[m.id]?.home ?? ""} disabled={!open} onChange={(v) => update(m.id, "home", v)} />
                <span className="text-mist/70">:</span>
                <ScoreInput label={`${m.away_team} score`} value={draft[m.id]?.away ?? ""} disabled={!open} onChange={(v) => update(m.id, "away", v)} />
              </div>

              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <Crest src={m.away_crest} name={m.away_team} />
                <span className="w-full truncate text-sm font-semibold">{m.away_team}</span>
              </div>
            </div>

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

      {saved.some((s) => s.points_earned !== null) && (
        <p className="pt-2 text-center text-sm text-mist">
          Round total: <b className="text-white">{totalPoints} pts</b>
        </p>
      )}

      {canEdit && editable.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-white/10 bg-plum/90 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
          <div className="mx-auto max-w-md">
            <button onClick={onSave} disabled={pending || changed.length === 0} className={primaryButtonClass}>
              {pending && <SpinnerIcon size={18} />}
              {changed.length === 0 ? "All predictions saved" : `Submit ${changed.length} prediction${changed.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
