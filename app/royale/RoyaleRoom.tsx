"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Banner, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SendIcon, SpinnerIcon } from "@/components/icons";
import { etbLabel } from "@/lib/money";
import { challengePrizeUnits } from "@/lib/challenges";
import { ROYALE_QUESTIONS, ROYALE_QUESTION_SECONDS, type RoyaleState } from "@/lib/royale";
import { answerRoyale, joinRoyale, leaveRoyale, startRoyale } from "./actions";

const LETTERS = ["A", "B", "C", "D"];
const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

/** The room: lobby, the live game (polled once a second), and the results. The server decides every time and every answer. */
export function RoyaleRoom({ code, initial, balanceUnits, url }: { code: string; initial: RoyaleState; balanceUnits: number; url: string }) {
  const [st, setSt] = useState<RoyaleState>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [choice, setChoice] = useState<{ q: number; i: number } | null>(null); // my tap, shown at once
  const gotAt = useRef(0);
  const phaseRef = useRef(st.phase);
  const [, force] = useState(0);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/royale/${encodeURIComponent(code)}`, { cache: "no-store" });
      const d = (await res.json()) as RoyaleState | { error: string } | null;
      if (d && !("error" in d)) {
        gotAt.current = performance.now();
        phaseRef.current = d.phase;
        setSt(d);
      }
    } catch {
      /* the next poll tries again */
    }
  }, [code]);

  useEffect(() => {
    gotAt.current = performance.now();
  }, []);

  // poll: once a second while a game is running, every 3 seconds in the lobby, never after the end
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (stopped) return;
      const p = phaseRef.current;
      if (p === "finished" || p === "cancelled") return;
      await refresh();
      if (stopped) return;
      const live = ["countdown", "question", "reveal", "finishing"].includes(phaseRef.current);
      timer = setTimeout(loop, live ? 1000 : 3000);
    };
    timer = setTimeout(loop, 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  // smooth countdown between polls
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 200);
    return () => clearInterval(t);
  }, []);

  const left = Math.max(0, st.ms_left - (performance.now() - gotAt.current));
  const me = st.players.find((p) => p.is_me);
  const pot = st.stake_units * st.players.length;
  const prize = challengePrizeUnits(st.stake_units, st.players.length);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      await refresh();
    });
  }

  function pick(i: number) {
    if (!st.question || st.phase !== "question") return;
    const q = st.question.index;
    if (st.question.my_choice !== null || choice?.q === q) return;
    setChoice({ q, i });
    setMsg(null);
    answerRoyale(code, q, i).then((r) => {
      if (!r.ok) {
        setChoice(null);
        setMsg({ ok: false, text: r.message });
      }
      void refresh();
    });
  }

  const myChoice = st.question ? (choice && choice.q === st.question.index ? choice.i : st.question.my_choice) : null;

  // ------------------------------------------------------------------ results
  if (st.phase === "finished" || st.phase === "cancelled") {
    const won = me?.payout && me.payout > 0;
    return (
      <div className="space-y-5">
        <section className={`${card} text-center`}>
          <p className="text-4xl">{st.phase === "cancelled" ? "↩️" : won ? "🏆" : st.status === "refunded" ? "🤝" : "📊"}</p>
          <h1 className="mt-2 text-2xl font-extrabold">
            {st.phase === "cancelled" ? "Room cancelled" : won ? `You won ${etbLabel(me!.payout!)}!` : st.status === "refunded" ? "Nobody scored" : "Game over"}
          </h1>
          <p className="mt-1 text-sm text-mist">
            {st.phase === "cancelled"
              ? "Everyone's entry went back to their wallet."
              : st.status === "refunded"
                ? "Every entry was refunded in full."
                : me?.rank
                  ? `You finished #${me.rank} of ${st.players.length} with ${me.score} points.`
                  : "Thanks for playing."}
          </p>
        </section>
        {st.phase === "finished" && (
          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Final table</h2>
            <ul className="divide-y divide-white/5">
              {st.players.map((p, i) => (
                <li key={p.username} className={`flex items-center gap-3 py-2.5 ${p.is_me ? "font-bold text-white" : ""}`}>
                  <span className="w-6 text-center text-sm font-extrabold text-mist">{p.rank ?? i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{p.username}{p.is_me && " (you)"}</span>
                  <span className="text-sm font-extrabold">{p.score} pts</span>
                  {p.payout ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-bold text-emerald-200">+{etbLabel(p.payout)}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        )}
        {st.review && st.review.length > 0 && (
          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">The questions</h2>
            <ol className="space-y-3">
              {st.review.map((q) => (
                <li key={q.index} className="rounded-2xl border border-white/5 bg-ink/40 p-3 text-sm">
                  <p className="font-bold">{q.index + 1}. {q.text}</p>
                  <p className="mt-1 text-xs">
                    Right answer: <b className="text-emerald-200">{q.options[q.correct]}</b>
                    {q.my_choice === null ? <span className="text-mist"> · you didn&apos;t answer</span> : q.my_choice === q.correct ? <span className="text-emerald-200"> · you got it (+{q.points})</span> : <span className="text-rose-200"> · you picked {q.options[q.my_choice]}</span>}
                  </p>
                </li>
              ))}
            </ol>
          </section>
        )}
        <a href="/royale" className={`${primaryButtonClass} w-full justify-center`}>Play again</a>
      </div>
    );
  }

  // ------------------------------------------------------------------ live game
  if (st.is_member && (st.phase === "countdown" || st.phase === "question" || st.phase === "reveal" || st.phase === "finishing")) {
    const q = st.question;
    return (
      <div className="space-y-4">
        <section className={`${card} text-center`}>
          {st.phase === "countdown" && (
            <>
              <p className="text-xs font-bold uppercase tracking-widest text-mist">Get ready</p>
              <p className="mt-2 text-6xl font-extrabold text-lilac-soft">{Math.ceil(left / 1000)}</p>
            </>
          )}
          {st.phase === "finishing" && (
            <p className="flex items-center justify-center gap-2 text-sm text-mist"><SpinnerIcon size={16} /> Counting the points…</p>
          )}
          {q && (st.phase === "question" || st.phase === "reveal") && (
            <>
              <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-mist">
                <span>Question {q.index + 1} of {ROYALE_QUESTIONS}</span>
                <span className={st.phase === "question" && left < 5000 ? "text-rose-300" : ""}>
                  {st.phase === "question" ? `${Math.ceil(left / 1000)} s` : "Time's up"}
                </span>
              </div>
              <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${st.phase === "question" ? "bg-lilac" : "bg-white/20"}`}
                  style={{ width: st.phase === "question" ? `${Math.min(100, (left / (ROYALE_QUESTION_SECONDS * 1000)) * 100)}%` : "0%" }}
                />
              </div>
              <h1 className="text-left text-xl font-extrabold leading-snug sm:text-2xl">{q.text}</h1>
              <div className="mt-4 grid gap-2 text-left">
                {q.options.map((o, i) => {
                  const reveal = st.phase === "reveal" && st.reveal;
                  const isRight = reveal && st.reveal!.correct === i;
                  const isMineWrong = reveal && myChoice === i && st.reveal!.correct !== i;
                  const chosen = myChoice === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={st.phase !== "question" || myChoice !== null}
                      onClick={() => pick(i)}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left text-base font-semibold transition ${
                        isRight
                          ? "border-emerald-300/60 bg-emerald-300/15 text-white"
                          : isMineWrong
                            ? "border-rose-300/60 bg-rose-300/15 text-white"
                            : chosen
                              ? "border-lilac bg-lilac/20 text-white"
                              : "border-white/10 bg-ink/40 text-white hover:border-white/30 disabled:hover:border-white/10"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-extrabold">{LETTERS[i]}</span>
                      <span className="min-w-0 flex-1">{o}</span>
                      {isRight && <span>✅</span>}
                      {isMineWrong && <span>❌</span>}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-mist">
                {st.phase === "question"
                  ? myChoice !== null ? "Locked in ✓ The right answer shows when the time is up." : "Faster right answers score more."
                  : myChoice === null ? "You didn't answer this one." : st.reveal && myChoice === st.reveal.correct ? "Right!" : "Not this time."}
              </p>
            </>
          )}
        </section>
        {msg && <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>}
        <section className={card}>
          <h2 className="mb-2 text-sm font-extrabold uppercase tracking-widest text-mist">Scores</h2>
          <ul className="divide-y divide-white/5">
            {st.players.map((p) => (
              <li key={p.username} className={`flex items-center gap-3 py-2 text-sm ${p.is_me ? "font-bold text-white" : ""}`}>
                <span className="min-w-0 flex-1 truncate">{p.username}{p.is_me && " (you)"}</span>
                <span className="font-extrabold">{p.score}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    );
  }

  // ------------------------------------------------------------------ lobby
  const full = st.players.length >= st.max_players;
  const canStart = st.is_creator && st.players.length >= st.min_players;
  const enough = balanceUnits >= st.stake_units;
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`🧠 Join my Quiz Royale on GebetaSoccer! 10 football questions, ${etbLabel(st.stake_units)} entry. Code ${st.code}`)}`;
  const live = st.status === "live";

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-lilac/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lilac-soft">{live ? "Live" : "Waiting for players"}</span>
          <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{st.code} · by {st.creator}</span>
        </div>
        <h1 className="mt-2 text-2xl font-extrabold">🧠 Quiz Royale</h1>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Entry</p>
            <p className="mt-1 text-sm font-extrabold sm:text-lg">{etbLabel(st.stake_units)}</p>
          </div>
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Players</p>
            <p className="mt-1 text-sm font-extrabold sm:text-lg">{st.players.length}<span className="text-xs font-bold text-mist"> / {st.max_players}</span></p>
          </div>
          <div className="rounded-2xl bg-ink/50 p-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Winner gets</p>
            <p className="mt-1 text-sm font-extrabold text-lilac-soft sm:text-lg">{etbLabel(prize)}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-mist">
          Pot {etbLabel(pot)}. The winner gets their entry back + 90% of the others&apos; entries. 10 questions, 15 seconds each. Ties share.
          The room starts when the creator presses Start (at least {st.min_players} players). If it doesn&apos;t start within {Math.max(1, Math.ceil(st.expires_in_s / 60))} min, every entry is refunded.
        </p>
      </section>

      {msg && <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>}

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">Who&apos;s in</h2>
        <ul className="divide-y divide-white/5">
          {st.players.map((p, i) => (
            <li key={p.username} className={`flex items-center gap-3 py-2.5 ${p.is_me ? "font-bold text-white" : ""}`}>
              <span className="w-6 text-center text-sm font-extrabold text-mist">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm">{p.username}{p.is_me && " (you)"}{p.is_creator && " 👑"}</span>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex flex-wrap gap-2">
          {!st.is_member && st.status === "open" && !full && (
            <button type="button" disabled={pending || !enough} onClick={() => run(() => joinRoyale(code))} className={`${primaryButtonClass} disabled:opacity-50`}>
              {pending && <SpinnerIcon size={16} />} Join · {etbLabel(st.stake_units)}
            </button>
          )}
          {!st.is_member && !enough && st.status === "open" && <p className="w-full text-xs text-amber-100">You need {etbLabel(st.stake_units - balanceUnits)} more. Ask the admin for a top-up.</p>}
          {!st.is_member && st.status === "open" && full && <p className="text-sm text-mist">This room is full.</p>}
          {!st.is_member && st.status !== "open" && <p className="text-sm text-mist">This game already started.</p>}
          {st.is_member && st.status === "open" && st.is_creator && (
            <button type="button" disabled={pending || !canStart} onClick={() => run(() => startRoyale(code))} className={`${primaryButtonClass} disabled:opacity-50`}>
              {pending && <SpinnerIcon size={16} />} Start the game{!canStart ? ` (need ${st.min_players - st.players.length} more)` : ""}
            </button>
          )}
          {st.is_member && st.status === "open" && (
            <button type="button" disabled={pending} onClick={() => run(() => leaveRoyale(code))} className={`${secondaryButtonClass}`}>
              {st.is_creator ? "Cancel room" : "Leave"} (entry back)
            </button>
          )}
        </div>
      </section>

      {st.is_member && st.status === "open" && (
        <section className={card}>
          <h2 className="mb-1 text-lg font-extrabold">Invite friends</h2>
          <p className="mb-3 text-sm text-mist">Each needs {etbLabel(st.stake_units)} in their wallet. Code <b className="text-white">{st.code}</b></p>
          <div className="flex gap-2">
            <input readOnly value={url} onFocus={(e) => e.target.select()} className="w-full rounded-2xl border border-white/10 bg-ink/70 px-4 py-3 text-sm text-white outline-none" />
            <button
              type="button"
              className={`${secondaryButtonClass} shrink-0`}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(url);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                } catch {
                  /* the field is selectable */
                }
              }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <a href={tgShare} target="_blank" rel="noreferrer" className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white hover:brightness-110">
            <SendIcon size={14} /> Share on Telegram
          </a>
        </section>
      )}
    </div>
  );
}
