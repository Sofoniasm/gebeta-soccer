"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Banner, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SendIcon, SpinnerIcon } from "@/components/icons";
import { etbLabel } from "@/lib/money";
import { challengePrizeUnits } from "@/lib/challenges";
import { DAMA_MOVE_SECONDS, damaCell, damaCounts, damaOwner, type DamaState } from "@/lib/dama";
import { cancelDama, joinDama, moveDama, resignDama } from "./actions";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

/** The game: waiting for an opponent, the board, and the result. The database checks every move and keeps the clock. */
export function DamaGame({ code, initial, balanceUnits, url }: { code: string; initial: DamaState; balanceUnits: number; url: string }) {
  const [st, setSt] = useState<DamaState>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const gotAt = useRef(0);
  const statusRef = useRef(st.status);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/dama/${encodeURIComponent(code)}`, { cache: "no-store" });
      const d = (await res.json()) as DamaState | { error: string } | null;
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

  const seat = st.my_seat;
  const myTurn = st.status === "live" && seat !== 0 && st.turn === seat;
  const left = st.ms_left === null ? 0 : Math.max(0, st.ms_left - (performance.now() - gotAt.current));
  const them = seat === 1 ? st.opponent : seat === 2 ? st.creator : st.opponent;
  const prize = challengePrizeUnits(st.stake_units, 2);
  const enough = balanceUnits >= st.stake_units;
  const counts = damaCounts(st.board);
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`♟️ Play Dama with me on GebetaSoccer! ${etbLabel(st.stake_units)} each, winner takes the pot. Code ${st.code}`)}`;

  // moves I may play, grouped by piece; during a capture chain the piece is chosen for me
  const byFrom = useMemo(() => {
    const m = new Map<number, number[]>();
    if (myTurn) for (const [f, t] of st.legal) m.set(f, [...(m.get(f) ?? []), t]);
    return m;
  }, [st.legal, myTurn]);
  const active = myTurn ? (st.chain_from ?? sel) : null;
  const targets = active !== null ? (byFrom.get(active) ?? []) : [];

  function tapCell(cell: number) {
    if (!myTurn || busy || pending) return;
    if (active !== null && targets.includes(cell)) {
      const from = active;
      setBusy(true);
      setMsg(null);
      setSel(null);
      moveDama(code, from, cell).then(async (r) => {
        if (!r.ok) setMsg({ ok: false, text: r.message });
        await refresh();
        setBusy(false);
      });
      return;
    }
    if (st.chain_from === null) setSel(byFrom.has(cell) ? cell : null);
  }

  const header = (
    <section className="relative overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-lilac/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lilac-soft">
          {st.status === "open" ? "Waiting for an opponent" : st.status === "live" ? "Playing" : st.status === "settled" ? "Finished" : "Cancelled"}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{st.code}</span>
      </div>
      <h1 className="mt-2 text-2xl font-extrabold">♟️ {st.creator} vs {st.opponent ?? "…"}</h1>
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

  const board = (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-bold text-mist">
        <span>{them ?? "Opponent"} · {seat === 2 ? counts.p1 : counts.p2} men</span>
      </div>
      <div className="mx-auto grid max-w-[30rem] grid-cols-8 overflow-hidden rounded-2xl border border-white/10">
        {Array.from({ length: 64 }, (_, i) => {
          const dr = Math.floor(i / 8);
          const dc = i % 8;
          const cell = damaCell(seat, dr, dc);
          const v = st.board[cell] ?? 0;
          const owner = damaOwner(v);
          const mine = owner !== 0 && owner === (seat === 0 ? 1 : seat);
          const isTarget = targets.includes(cell);
          const movable = myTurn && st.chain_from === null && byFrom.has(cell);
          const isSel = active === cell;
          const last = st.last_from === cell || st.last_to === cell;
          return (
            <button
              key={i}
              type="button"
              onClick={() => tapCell(cell)}
              disabled={!myTurn || (!isTarget && !movable && !isSel)}
              className={`relative flex aspect-square items-center justify-center ${(dr + dc) % 2 === 0 ? "bg-[#2b2550]" : "bg-[#1b1738]"} ${isTarget ? "ring-2 ring-inset ring-emerald-300" : ""} ${isSel ? "ring-2 ring-inset ring-lilac" : ""} ${last && !isTarget ? "ring-1 ring-inset ring-amber-200/60" : ""} disabled:cursor-default`}
            >
              {v !== 0 && (
                <span
                  className={`flex h-[78%] w-[78%] items-center justify-center rounded-full border-2 text-xs font-extrabold shadow ${
                    mine ? "border-lilac-soft bg-lilac text-white" : "border-white/30 bg-white text-ink"
                  } ${movable ? "animate-pulse" : ""}`}
                >
                  {v === 2 || v === 4 ? "♛" : ""}
                </span>
              )}
              {isTarget && v === 0 && <span className="h-2.5 w-2.5 rounded-full bg-emerald-300/80" />}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs font-bold text-mist">
        <span>{seat === 0 ? st.creator : "You"} · {seat === 2 ? counts.p2 : counts.p1} men</span>
      </div>
    </div>
  );

  // ------------------------------------------------------------------ finished
  if (st.status === "settled" || st.status === "cancelled") {
    const draw = st.result === "draw";
    return (
      <div className="space-y-5">
        <section className={`${card} text-center`}>
          <p className="text-4xl">{st.status === "cancelled" ? "↩️" : draw ? "🤝" : st.i_won ? "🏆" : "♟️"}</p>
          <h2 className="mt-2 text-2xl font-extrabold">
            {st.status === "cancelled" ? "Game cancelled" : draw ? "A draw" : seat === 0 ? `${st.winner} won` : st.i_won ? `You won ${etbLabel(prize)}!` : "You lost this one"}
          </h2>
          <p className="mt-1 text-sm text-mist">
            {st.status === "cancelled"
              ? "Your stake went back to your wallet."
              : draw
                ? "No captures for too long: both stakes were returned."
                : st.result === "timeout"
                  ? `${st.winner} wins: the other player ran out of time.`
                  : st.result === "resign"
                    ? `${st.winner} wins: the other player resigned.`
                    : `${st.winner} won the game.`}
          </p>
        </section>
        {st.status === "settled" && st.opponent && <section className={card}>{board}</section>}
        <a href="/dama" className={`${primaryButtonClass} w-full justify-center`}>Play again</a>
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
            <span className={myTurn ? "text-emerald-200" : "text-mist"}>{seat === 0 ? `${st.turn === 1 ? st.creator : st.opponent}'s turn` : myTurn ? (st.chain_from !== null ? "Keep jumping!" : "Your turn") : `${them}'s turn`}</span>
            <span className={left < 10000 ? "text-rose-300" : "text-mist"}>{Math.ceil(left / 1000)} s</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full transition-[width] duration-200 ${myTurn ? "bg-emerald-300" : "bg-white/25"}`} style={{ width: `${Math.min(100, (left / (DAMA_MOVE_SECONDS * 1000)) * 100)}%` }} />
          </div>
          {board}
          <p className="mt-4 text-xs text-mist">
            Tap one of your pieces (they pulse when they can move), then tap a green square. Men step forward or sideways; jump over an enemy to capture. You must capture when you can and keep jumping with the same piece. Reach the far row to become a king ♛ that moves and captures along any line.
          </p>
        </section>
        {seat !== 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Resign? You lose your stake.")) run(() => resignDama(code));
            }}
            className={`${secondaryButtonClass} w-full justify-center`}
          >
            Resign
          </button>
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
            <button type="button" disabled={pending} onClick={() => run(() => cancelDama(code))} className={`${secondaryButtonClass} mt-3 w-full justify-center`}>
              Cancel game (stake back)
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold">{st.creator} is waiting for an opponent</h2>
            <p className="mt-1 text-sm text-mist">Join with {etbLabel(st.stake_units)}. The game starts right away and a coin toss decides who plays first.</p>
            <button type="button" disabled={pending || !enough} onClick={() => run(() => joinDama(code))} className={`${primaryButtonClass} mt-3 disabled:opacity-50`}>
              {pending && <SpinnerIcon size={16} />} Join · {etbLabel(st.stake_units)}
            </button>
            {!enough && <p className="mt-2 text-xs text-amber-100">You need {etbLabel(st.stake_units - balanceUnits)} more. Ask the admin for a top-up.</p>}
          </>
        )}
      </section>
    </div>
  );
}
