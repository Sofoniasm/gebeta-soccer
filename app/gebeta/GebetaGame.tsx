"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Banner, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SendIcon, SpinnerIcon } from "@/components/icons";
import { etbLabel } from "@/lib/money";
import { challengePrizeUnits } from "@/lib/challenges";
import { GEBETA_MOVE_SECONDS, gebetaView, type GebetaState } from "@/lib/gebeta";
import { cancelGebeta, joinGebeta, moveGebeta, resignGebeta } from "./actions";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

function Pit({ seeds, active, hot, onClick, label }: { seeds: number; active: boolean; hot: boolean; onClick?: () => void; label?: string }) {
  return (
    <button
      type="button"
      disabled={!active}
      onClick={onClick}
      className={`flex aspect-square min-w-0 flex-1 flex-col items-center justify-center rounded-full border text-lg font-extrabold transition sm:text-2xl ${
        active ? "border-lilac bg-lilac/20 text-white hover:bg-lilac/35" : hot ? "border-amber-200/70 bg-amber-200/10 text-white" : "border-white/10 bg-ink/50 text-white"
      } disabled:cursor-default`}
    >
      {seeds}
      {label && <span className="text-[9px] font-semibold uppercase tracking-wider text-mist">{label}</span>}
    </button>
  );
}

/** The game: waiting for an opponent, the board, and the result. The database plays every move and keeps the clock. */
export function GebetaGame({ code, initial, balanceUnits, url }: { code: string; initial: GebetaState; balanceUnits: number; url: string }) {
  const [st, setSt] = useState<GebetaState>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false); // a move is on its way
  const [copied, setCopied] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const gotAt = useRef(0);
  const statusRef = useRef(st.status);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/gebeta/${encodeURIComponent(code)}`, { cache: "no-store" });
      const d = (await res.json()) as GebetaState | { error: string } | null;
      if (d && !("error" in d)) {
        gotAt.current = performance.now();
        statusRef.current = d.status;
        setSt(d);
      }
    } catch {
      /* the next poll tries again */
    }
  }, [code]);

  useEffect(() => {
    gotAt.current = performance.now();
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (stopped) return;
      const s = statusRef.current;
      if (s === "settled" || s === "cancelled") return;
      await refresh();
      if (stopped) return;
      timer = setTimeout(loop, statusRef.current === "live" ? 1500 : 4000);
    };
    timer = setTimeout(loop, 1500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      if (r.message) setMsg({ ok: r.ok, text: r.message });
      await refresh();
    });
  }

  function play(pit: number) {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    moveGebeta(code, pit).then(async (r) => {
      if (!r.ok) setMsg({ ok: false, text: r.message });
      await refresh();
      setBusy(false);
    });
  }

  const seat = st.my_seat;
  const myTurn = st.status === "live" && seat !== 0 && st.turn === seat;
  const left = st.ms_left === null ? 0 : Math.max(0, st.ms_left - (performance.now() - gotAt.current));
  const v = gebetaView(st.board, seat);
  const me = seat === 1 ? st.creator : seat === 2 ? st.opponent : null;
  const them = seat === 1 ? st.opponent : seat === 2 ? st.creator : st.opponent;
  const prize = challengePrizeUnits(st.stake_units, 2);
  const enough = balanceUnits >= st.stake_units;
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`🎲 Play Gebeta with me on GebetaSoccer! ${etbLabel(st.stake_units)} each, winner takes the pot. Code ${st.code}`)}`;

  const header = (
    <section className="relative overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-lilac/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lilac-soft">
          {st.status === "open" ? "Waiting for an opponent" : st.status === "live" ? "Playing" : st.status === "settled" ? "Finished" : "Cancelled"}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{st.code}</span>
      </div>
      <h1 className="mt-2 text-2xl font-extrabold">🎲 {st.creator} vs {st.opponent ?? "…"}</h1>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center">
        <div className="rounded-2xl bg-ink/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Stake each</p>
          <p className="mt-1 text-sm font-extrabold sm:text-lg">{etbLabel(st.stake_units)}</p>
        </div>
        <div className="rounded-2xl bg-ink/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Winner gets</p>
          <p className="mt-1 text-sm font-extrabold text-lilac-soft sm:text-lg">{etbLabel(prize)}</p>
        </div>
      </div>
    </section>
  );

  // ------------------------------------------------------------------ finished
  if (st.status === "settled" || st.status === "cancelled") {
    const draw = st.result === "draw";
    return (
      <div className="space-y-5">
        <section className={`${card} text-center`}>
          <p className="text-4xl">{st.status === "cancelled" ? "↩️" : draw ? "🤝" : st.i_won ? "🏆" : "🎲"}</p>
          <h2 className="mt-2 text-2xl font-extrabold">
            {st.status === "cancelled" ? "Game cancelled" : draw ? "A draw" : seat === 0 ? `${st.winner} won` : st.i_won ? `You won ${etbLabel(prize)}!` : "You lost this one"}
          </h2>
          <p className="mt-1 text-sm text-mist">
            {st.status === "cancelled"
              ? "Your stake went back to your wallet."
              : draw
                ? "Equal seeds: both stakes were returned."
                : st.result === "timeout"
                  ? `${st.winner} wins: the other player ran out of time.`
                  : st.result === "resign"
                    ? `${st.winner} wins: the other player resigned.`
                    : `${st.winner} finished with more seeds (${Math.max(st.board[6], st.board[13])} vs ${Math.min(st.board[6], st.board[13])}).`}
          </p>
        </section>
        {st.status === "settled" && st.opponent && (
          <section className={card}>
            <BoardView st={st} v={v} me={me} them={them} myTurn={false} onPlay={() => {}} />
          </section>
        )}
        <a href="/gebeta" className={`${primaryButtonClass} w-full justify-center`}>Play again</a>
      </div>
    );
  }

  // ------------------------------------------------------------------ playing
  if (st.status === "live") {
    return (
      <div className="space-y-5">
        {header}
        {msg && <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>}
        <section className={card}>
          <div className="mb-4 flex items-center justify-between text-xs font-bold uppercase tracking-widest">
            <span className={myTurn ? "text-emerald-200" : "text-mist"}>{seat === 0 ? `${st.turn === 1 ? st.creator : st.opponent}'s turn` : myTurn ? "Your turn" : `${them}'s turn`}</span>
            <span className={left < 10000 ? "text-rose-300" : "text-mist"}>{Math.ceil(left / 1000)} s</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full transition-[width] duration-200 ${myTurn ? "bg-emerald-300" : "bg-white/25"}`} style={{ width: `${Math.min(100, (left / (GEBETA_MOVE_SECONDS * 1000)) * 100)}%` }} />
          </div>
          <BoardView st={st} v={v} me={me} them={them} myTurn={myTurn && !busy && !pending} onPlay={play} />
          <p className="mt-4 text-xs text-mist">
            Pick one of your pits (bottom row): its seeds are dropped one by one to the right, through your store and round the other side. Last seed in your store = play again. Last seed in an empty pit of yours = you capture the seeds opposite.
          </p>
        </section>
        {seat !== 0 && (
          confirmResign ? (
            <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 text-center">
              <p className="text-sm font-bold">Resign this game? You lose your stake.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={pending} onClick={() => run(() => resignGebeta(code))} className="flex-1 rounded-full bg-rose-400 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:brightness-110">
                  Yes, resign
                </button>
                <button type="button" onClick={() => setConfirmResign(false)} className={`${secondaryButtonClass} flex-1 justify-center`}>
                  Keep playing
                </button>
              </div>
            </div>
          ) : (
            <button type="button" disabled={pending} onClick={() => setConfirmResign(true)} className={`${secondaryButtonClass} w-full justify-center`}>
              Resign
            </button>
          )
        )}
      </div>
    );
  }

  // ------------------------------------------------------------------ open: waiting / join
  return (
    <div className="space-y-5">
      {header}
      {msg && <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>}
      <section className={card}>
        {seat === 1 ? (
          <>
            <h2 className="text-lg font-extrabold">Waiting for an opponent…</h2>
            <p className="mt-1 text-sm text-mist">Send this link to a friend. If nobody joins within {Math.max(1, Math.ceil(st.expires_in_s / 60))} min, your stake is refunded.</p>
            <div className="mt-3 flex gap-2">
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
            <button type="button" disabled={pending} onClick={() => run(() => cancelGebeta(code))} className={`${secondaryButtonClass} mt-3 w-full justify-center`}>
              Cancel game (stake back)
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold">{st.creator} is waiting for an opponent</h2>
            <p className="mt-1 text-sm text-mist">Join with {etbLabel(st.stake_units)}. The game starts right away and a coin toss decides who plays first.</p>
            <button type="button" disabled={pending || !enough} onClick={() => run(() => joinGebeta(code))} className={`${primaryButtonClass} mt-3 disabled:opacity-50`}>
              {pending && <SpinnerIcon size={16} />} Join · {etbLabel(st.stake_units)}
            </button>
            {!enough && <p className="mt-2 text-xs text-amber-100">You need {etbLabel(st.stake_units - balanceUnits)} more. Ask the admin for a top-up.</p>}
          </>
        )}
      </section>
    </div>
  );
}

function BoardView({ st, v, me, them, myTurn, onPlay }: { st: GebetaState; v: ReturnType<typeof gebetaView>; me: string | null; them: string | null; myTurn: boolean; onPlay: (pit: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-bold text-mist">
        <span>{them ?? "Opponent"}</span>
        <span>Store: <b className="text-white">{v.theirStore}</b></span>
      </div>
      <div className="flex gap-1.5 sm:gap-3">
        {v.theirs.map((p) => (
          <Pit key={p.cell} seeds={p.seeds} active={false} hot={st.last_pit === p.cell} />
        ))}
      </div>
      <div className="my-2 flex gap-1.5 sm:gap-3">
        {v.mine.map((p, i) => (
          <Pit key={p.cell} seeds={p.seeds} active={myTurn && p.seeds > 0} hot={st.last_pit === p.cell} onClick={() => onPlay(i)} label={String(i + 1)} />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-bold text-mist">
        <span>{me ?? "You"}{me ? " (you)" : ""}</span>
        <span>Store: <b className="text-white">{v.myStore}</b></span>
      </div>
    </div>
  );
}
