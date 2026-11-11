"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Crest, dayKeyOf, dayOf, timeOf } from "@/components/MatchLine";
import { Banner, inputClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { ETB_PER_UNIT, etbLabel, unitsLabel } from "@/lib/money";
import { CHALLENGE_FEE, CHALLENGE_MAX_MATCHES, challengePrizeUnits, etbToUnits, stakeError } from "@/lib/challenges";
import { createChallenge } from "../actions";

export interface UpcomingMatch {
  id: number;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  competition: string | null;
  kickoff_at: string;
}

type Score = { home: string; away: string };

const QUICK_ETB = [200, 500, 1000, 2000, 5000, 10000];
const MAX_OPTIONS: [string, number | null][] = [
  ["No limit", null],
  ["1 vs 1", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["10", 10],
  ["20", 20],
];

function ScoreBox({ value, label, onChange }: { value: string; label: string; onChange: (v: string) => void }) {
  return (
    <input
      aria-label={label}
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={2}
      value={value}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      onFocus={(e) => e.target.select()}
      placeholder="–"
      className="h-12 w-12 rounded-2xl border border-white/15 bg-ink text-center text-xl font-extrabold text-white outline-none focus:border-lilac focus:ring-2 focus:ring-lilac/25"
    />
  );
}

export function ChallengeBuilder({
  matches,
  balanceUnits,
  defaultTitle,
  phoneVerified,
  initialMatchId = null,
}: {
  matches: UpcomingMatch[];
  balanceUnits: number;
  defaultTitle: string;
  phoneVerified: boolean;
  initialMatchId?: number | null;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [picked, setPicked] = useState<Record<number, Score>>(() =>
    initialMatchId && matches.some((m) => m.id === initialMatchId) ? { [initialMatchId]: { home: "", away: "" } } : {},
  );
  const [comp, setComp] = useState<string>("All");
  const [title, setTitle] = useState(defaultTitle);
  const [stake, setStake] = useState("1000");
  const [maxPlayers, setMaxPlayers] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const comps = useMemo(() => ["All", ...Array.from(new Set(matches.map((m) => m.competition ?? "Other")))], [matches]);
  const shown = comp === "All" ? matches : matches.filter((m) => (m.competition ?? "Other") === comp);
  const byDay = useMemo(() => {
    const g = new Map<string, UpcomingMatch[]>();
    for (const m of shown) {
      const k = dayKeyOf(m.kickoff_at);
      g.set(k, [...(g.get(k) ?? []), m]);
    }
    return [...g.values()];
  }, [shown]);

  const ids = Object.keys(picked).map(Number);
  const count = ids.length;
  const scored = ids.filter((id) => picked[id].home !== "" && picked[id].away !== "").length;
  const allScored = count > 0 && scored === count;

  const stakeEtb = Number(stake);
  const sErr = stake === "" ? "Enter a stake." : stakeError(stakeEtb);
  const stakeUnits = sErr ? 0 : etbToUnits(stakeEtb);
  const enough = stakeUnits <= balanceUnits;

  function toggle(id: number) {
    setError(null);
    setPicked((p) => {
      if (p[id]) {
        const next = { ...p };
        delete next[id];
        return next;
      }
      if (Object.keys(p).length >= CHALLENGE_MAX_MATCHES) {
        setError(`You can pick up to ${CHALLENGE_MAX_MATCHES} matches.`);
        return p;
      }
      return { ...p, [id]: { home: "", away: "" } };
    });
  }

  function submit() {
    setError(null);
    start(async () => {
      const r = await createChallenge({
        title,
        stakeEtb,
        maxPlayers,
        picks: ids.map((id) => ({ matchId: id, home: Number(picked[id].home), away: Number(picked[id].away) })),
      });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      router.push(`/challenges/${r.code}?created=1`);
    });
  }

  if (!phoneVerified) {
    return (
      <Banner kind="error">
        Confirm your phone number before playing for money. <Link href="/profile" className="underline">Go to Profile</Link>
      </Banner>
    );
  }

  return (
    <div className="pb-36 lg:pb-28">
      {/* progress */}
      <div className="mb-4 grid grid-cols-2 gap-2 text-center text-[11px] font-bold uppercase tracking-wider">
        <button type="button" onClick={() => setStep(1)} className={`rounded-full py-2 ${step === 1 ? "bg-lilac text-ink" : "bg-white/5 text-mist"}`}>
          1 · Matches & scores
        </button>
        <button type="button" disabled={!allScored} onClick={() => setStep(2)} className={`rounded-full py-2 disabled:opacity-40 ${step === 2 ? "bg-lilac text-ink" : "bg-white/5 text-mist"}`}>
          2 · Stake & players
        </button>
      </div>

      {error && <div className="mb-4"><Banner kind="error">{error}</Banner></div>}

      {step === 1 && (
        <>
          <p className="mb-3 text-sm text-mist">Tap 1 to {CHALLENGE_MAX_MATCHES} matches and type your score for each. Your friends predict the same matches.</p>
          {matches.length === 0 ? (
            <p className="rounded-2xl bg-card/60 p-5 text-sm text-mist">No upcoming matches yet. Check back after the next fixtures update.</p>
          ) : (
            <>
              <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {comps.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setComp(c)}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${comp === c ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}
                  >
                    {c}
                  </button>
                ))}
              </div>
              <div className="space-y-5">
                {byDay.map((day) => (
                  <div key={day[0].kickoff_at}>
                    <p className="mb-2 text-xs font-bold uppercase tracking-widest text-lilac">{dayOf(day[0].kickoff_at)}</p>
                    <div className="space-y-2">
                      {day.map((m) => {
                        const sel = picked[m.id];
                        return (
                          <div
                            key={m.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggle(m.id)}
                            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggle(m.id)}
                            className={`cursor-pointer rounded-2xl border px-3 py-3 transition ${sel ? "border-lilac/60 bg-lilac/10" : "border-white/5 bg-card/50 hover:border-white/20"}`}
                          >
                            <div className="flex items-center gap-2 text-[11px] text-mist">
                              <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] font-extrabold ${sel ? "border-lilac bg-lilac text-ink" : "border-white/25"}`}>{sel ? "✓" : ""}</span>
                              <span className="font-bold">{timeOf(m.kickoff_at)}</span>
                              <span className="truncate">{m.competition}</span>
                            </div>
                            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                              <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                                <span className="truncate text-sm font-semibold">{m.home_team}</span>
                                <Crest src={m.home_crest} name={m.home_team} size={24} />
                              </span>
                              {sel ? (
                                <span className="flex items-center gap-1.5">
                                  <ScoreBox value={sel.home} label={`${m.home_team} score`} onChange={(v) => setPicked((p) => ({ ...p, [m.id]: { ...p[m.id], home: v } }))} />
                                  <span className="text-mist">:</span>
                                  <ScoreBox value={sel.away} label={`${m.away_team} score`} onChange={(v) => setPicked((p) => ({ ...p, [m.id]: { ...p[m.id], away: v } }))} />
                                </span>
                              ) : (
                                <span className="px-3 text-xs font-extrabold text-mist">VS</span>
                              )}
                              <span className="flex min-w-0 items-center gap-2">
                                <Crest src={m.away_crest} name={m.away_team} size={24} />
                                <span className="truncate text-sm font-semibold">{m.away_team}</span>
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {step === 2 && (
        <div className="space-y-5">
          <div>
            <label htmlFor="ch-title" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist">Challenge name</label>
            <input id="ch-title" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} className={inputClass} />
          </div>

          <div>
            <label htmlFor="ch-stake" className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist">Stake per player (ETB)</label>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {QUICK_ETB.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setStake(String(q))}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${Number(stake) === q ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}
                >
                  {q.toLocaleString("en-US")}
                </button>
              ))}
            </div>
            <input id="ch-stake" inputMode="numeric" value={stake} onChange={(e) => setStake(e.target.value.replace(/\D/g, "").slice(0, 7))} className={inputClass} />
            <p className={`mt-1.5 text-xs ${sErr ? "text-rose-200" : "text-mist"}`}>
              {sErr ?? `${unitsLabel(stakeUnits)} · everyone who joins pays the same. 1 Unit = ${ETB_PER_UNIT} ETB.`}
            </p>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist">How many players?</span>
            <div className="flex flex-wrap gap-1.5">
              {MAX_OPTIONS.map(([l, v]) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setMaxPlayers(v)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-bold ${maxPlayers === v ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          {!sErr && (
            <div className="rounded-2xl border border-lilac/25 bg-lilac/10 p-4 text-sm">
              <p className="font-extrabold text-white">Winner takes {Math.round((1 - CHALLENGE_FEE) * 100)}% of all stakes</p>
              <ul className="mt-2 space-y-1 text-mist">
                {[2, 3, 5].filter((n) => !maxPlayers || n <= maxPlayers).map((n) => (
                  <li key={n} className="flex justify-between">
                    <span>{n} players</span>
                    <b className="text-white">{etbLabel(challengePrizeUnits(stakeUnits, n))}</b>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-mist/80">Ties share the prize. If nobody joins before the first kickoff, your stake comes back.</p>
            </div>
          )}

          <div className={`rounded-2xl p-4 text-sm ${enough ? "bg-white/5 text-mist" : "border border-amber-200/30 bg-amber-200/10 text-amber-50"}`}>
            Your balance: <b className="text-white">{unitsLabel(balanceUnits)} ({etbLabel(balanceUnits)})</b>
            {!enough && !sErr && (
              <span className="mt-1 block">
                You need {etbLabel(stakeUnits - balanceUnits)} more. Send it to our Telegram admin, then come back. <Link href="/wallet" className="font-bold underline">Wallet</Link>
              </span>
            )}
          </div>
        </div>
      )}

      {/* action bar */}
      <div className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 border-t border-white/10 bg-[#0b0912]/90 p-3 backdrop-blur-xl lg:bottom-0 lg:left-72 lg:p-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1 text-xs">
            <p className="font-extrabold text-white">{count} of {CHALLENGE_MAX_MATCHES} matches</p>
            <p className="text-mist">{count === 0 ? "Tap a match to pick it" : allScored ? "All scores in" : `${count - scored} score${count - scored === 1 ? "" : "s"} missing`}</p>
          </div>
          {step === 1 ? (
            <button
              type="button"
              disabled={!allScored}
              onClick={() => { setStep(2); window.scrollTo({ top: 0 }); }}
              className="rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-wider text-ink disabled:opacity-40"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={pending || !allScored || !!sErr || !enough || title.trim().length < 3}
              onClick={submit}
              className="inline-flex items-center gap-2 rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-wider text-ink disabled:opacity-40"
            >
              {pending && <SpinnerIcon size={14} className="animate-spin" />} Create & pay {sErr ? "" : etbLabel(stakeUnits)}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
