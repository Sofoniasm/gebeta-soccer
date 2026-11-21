"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Chess } from "chess.js";
import { Banner, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SendIcon, SpinnerIcon } from "@/components/icons";
import { etbLabel } from "@/lib/money";
import { challengePrizeUnits } from "@/lib/challenges";
import { BOT_NAME, CHESS_MOVE_SECONDS, PIECE_GLYPH, movePairs, type ChessState } from "@/lib/chess";
import { inCheck, legalTargets } from "@/lib/chess-rules";
import { cancelChess, joinChess, moveChess, resignChess } from "./actions";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";
const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"];

/** The game: waiting for an opponent, the board, and the result. The server checks every move and keeps the clock. */
export function ChessGame({ code, initial, balanceUnits, url }: { code: string; initial: ChessState; balanceUnits: number; url: string }) {
  const [st, setSt] = useState<ChessState>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ from: string; to: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const gotAt = useRef(0);
  const statusRef = useRef(st.status);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/chess/${encodeURIComponent(code)}`, { cache: "no-store" });
      const d = (await res.json()) as ChessState | { error: string } | null;
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
  const color = st.my_color;
  const myTurn = st.status === "live" && color !== null && st.turn === color;
  const left = st.ms_left === null ? 0 : Math.max(0, st.ms_left - (performance.now() - gotAt.current));
  const botWait = st.bot_wait_s === null ? 0 : Math.max(0, Math.ceil(st.bot_wait_s - (performance.now() - gotAt.current) / 1000));
  const them = seat === 1 ? st.opponent : seat === 2 ? st.creator : st.opponent;
  const prize = challengePrizeUnits(st.stake_units, 2);
  const enough = balanceUnits >= st.stake_units;
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`♞ Play Chess with me on GebetaSoccer! ${etbLabel(st.stake_units)} each, winner takes the pot. Code ${st.code}`)}`;

  const grid = useMemo(() => {
    try {
      return new Chess(st.fen).board();
    } catch {
      return [];
    }
  }, [st.fen]);
  const checked = useMemo(() => st.status === "live" && inCheck(st.fen), [st.fen, st.status]);
  const targets = useMemo(() => (myTurn && sel ? legalTargets(st.fen, sel) : []), [myTurn, sel, st.fen]);

  function send(from: string, to: string, promotion?: string) {
    setBusy(true);
    setMsg(null);
    setSel(null);
    setPromo(null);
    moveChess(code, from, to, promotion).then(async (r) => {
      if (!r.ok) setMsg({ ok: false, text: r.message });
      await refresh();
      setBusy(false);
    });
  }

  function tapSquare(sq: string, mine: boolean) {
    if (!myTurn || busy || pending || promo) return;
    const t = targets.find((x) => x.to === sq);
    if (sel && t) {
      if (t.promotion) setPromo({ from: sel, to: sq });
      else send(sel, sq);
      return;
    }
    setSel(mine ? (sel === sq ? null : sq) : null);
  }

  const flip = color === "b";
  const header = (
    <section className="relative overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-lilac/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lilac-soft">
          {st.status === "open" ? "Waiting for an opponent" : st.status === "live" ? "Playing" : st.status === "settled" ? "Finished" : "Cancelled"}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{st.code}</span>
      </div>
      <h1 className="mt-2 text-2xl font-extrabold">♞ {st.creator} vs {st.opponent === BOT_NAME ? "🤖 " : ""}{st.opponent ?? "…"}</h1>
      {st.vs_bot && (
        <p className="mt-2 rounded-xl bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
          🤖 <b>House Bot</b>: your opponent is a computer (Stockfish), not a person. It plays very strongly. Only 200 ETB games, a few per day.
        </p>
      )}
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
        <span>{st.vs_bot ? "🤖 " : ""}{them ?? "Opponent"} {st.status !== "open" && color && <span className="text-white/60">({color === "w" ? "black" : "white"})</span>}</span>
        {checked && <span className="rounded-full bg-rose-400/20 px-2 py-0.5 text-rose-200">Check!</span>}
      </div>
      <div className="mx-auto max-w-[32rem] rounded-2xl bg-gradient-to-br from-[#6b4423] to-[#3e2614] p-2 shadow-2xl shadow-black/50">
        <div className="grid grid-cols-8 overflow-hidden rounded-lg">
          {Array.from({ length: 64 }, (_, i) => {
            const dr = Math.floor(i / 8);
            const dc = i % 8;
            const r = flip ? 7 - dr : dr; // index into grid (rank 8 first)
            const c = flip ? 7 - dc : dc;
            const sq = `${FILES[c]}${8 - r}`;
            const p = grid[r]?.[c] ?? null;
            const mine = !!p && p.color === color;
            const isTarget = targets.some((t) => t.to === sq);
            const isSel = sel === sq;
            const last = st.last_from === sq || st.last_to === sq;
            const kingInCheck = checked && !!p && p.type === "k" && p.color === st.turn;
            const light = (r + c) % 2 === 0;
            return (
              <button
                key={i}
                type="button"
                onClick={() => tapSquare(sq, mine)}
                disabled={!myTurn || (!mine && !isTarget)}
                aria-label={sq}
                className={`relative flex aspect-square items-center justify-center ${light ? "bg-[#f0d9b5]" : "bg-[#b58863]"} ${last ? "after:absolute after:inset-0 after:bg-yellow-300/40" : ""} ${isSel ? "ring-4 ring-inset ring-sky-400" : ""} ${kingInCheck ? "bg-rose-400" : ""} disabled:cursor-default`}
              >
                {p && (
                  <span
                    className="relative z-10 text-[clamp(26px,8.4vw,52px)] leading-none"
                    style={
                      p.color === "w"
                        ? { color: "#fffdf5", textShadow: "0 0 2px #000, 0 0 2px #000, 0 1px 3px rgba(0,0,0,0.7)" }
                        : { color: "#15151b", textShadow: "0 0 1px rgba(255,255,255,0.6), 0 1px 2px rgba(0,0,0,0.5)" }
                    }
                  >
                    {PIECE_GLYPH[p.type]}
                  </span>
                )}
                {isTarget && <span className={`absolute z-20 rounded-full ring-2 ring-white/60 ${p ? "h-[88%] w-[88%] bg-emerald-500/35" : "h-[32%] w-[32%] bg-emerald-500/80"}`} />}
                {dc === 0 && <span className={`absolute left-0.5 top-0 text-[9px] font-bold ${light ? "text-[#b58863]" : "text-[#f0d9b5]"}`}>{8 - r}</span>}
                {dr === 7 && <span className={`absolute bottom-0 right-0.5 text-[9px] font-bold ${light ? "text-[#b58863]" : "text-[#f0d9b5]"}`}>{FILES[c]}</span>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2 text-xs font-bold text-mist">
        {seat === 0 ? st.creator : "You"} {color && <span className="text-white/60">({color === "w" ? "white" : "black"})</span>}
      </div>
      {promo && (
        <div className="mt-3 rounded-2xl border border-lilac/40 bg-lilac/10 p-3 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">Promote the pawn to</p>
          <div className="flex justify-center gap-2">
            {(["q", "r", "b", "n"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => send(promo.from, promo.to, k)}
                className="h-14 w-14 rounded-xl border border-white/20 bg-ink/60 text-3xl hover:bg-lilac/30"
                style={{ color: color === "w" ? "#fffdf5" : "#c9c9d4" }}
              >
                {PIECE_GLYPH[k]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  const moves = st.san_moves.length > 0 && (
    <div className="mt-4">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-mist">Moves</p>
      <p className="text-xs leading-relaxed text-white/80">
        {movePairs(st.san_moves).map((m) => (
          <span key={m.no} className="mr-2 inline-block">
            <span className="text-mist">{m.no}.</span> {m.white} {m.black ?? ""}
          </span>
        ))}
      </p>
    </div>
  );

  // ------------------------------------------------------------------ finished
  if (st.status === "settled" || st.status === "cancelled") {
    const draw = st.result === "draw";
    return (
      <div className="space-y-5">
        <section className={`${card} text-center`}>
          <p className="text-4xl">{st.status === "cancelled" ? "↩️" : draw ? "🤝" : st.i_won ? "🏆" : "♞"}</p>
          <h2 className="mt-2 text-2xl font-extrabold">
            {st.status === "cancelled" ? "Game cancelled" : draw ? "A draw" : seat === 0 ? `${st.winner} won` : st.i_won ? `You won ${etbLabel(prize)}!` : "You lost this one"}
          </h2>
          <p className="mt-1 text-sm text-mist">
            {st.status === "cancelled"
              ? "Your stake went back to your wallet."
              : draw
                ? "Both stakes were returned."
                : st.result === "timeout"
                  ? `${st.winner} wins: the other player ran out of time.`
                  : st.result === "resign"
                    ? `${st.winner} wins: the other player resigned.`
                    : `${st.winner} wins by checkmate.`}
          </p>
        </section>
        {st.status === "settled" && st.opponent && (
          <section className={card}>
            {board}
            {moves}
          </section>
        )}
        <a href="/chess" className={`${primaryButtonClass} w-full justify-center`}>Play again</a>
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
            <span className={myTurn ? "text-emerald-200" : "text-mist"}>{color === null ? `${st.turn === "w" ? "White" : "Black"} to move` : myTurn ? "Your turn" : `${them}'s turn`}</span>
            <span className={left < 20000 ? "text-rose-300" : "text-mist"}>{Math.floor(Math.ceil(left / 1000) / 60)}:{String(Math.ceil(left / 1000) % 60).padStart(2, "0")}</span>
          </div>
          <div className="mb-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className={`h-full rounded-full transition-[width] duration-200 ${myTurn ? "bg-emerald-300" : "bg-white/25"}`} style={{ width: `${Math.min(100, (left / (CHESS_MOVE_SECONDS * 1000)) * 100)}%` }} />
          </div>
          {board}
          {moves}
          <p className="mt-4 text-xs text-mist">Tap one of your pieces, then tap a highlighted square. 2 minutes per move: running out of time loses.</p>
        </section>
        {seat !== 0 &&
          (confirmResign ? (
            <div className="rounded-2xl border border-rose-300/30 bg-rose-300/10 p-4 text-center">
              <p className="text-sm font-bold">Resign this game? You lose your stake.</p>
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={pending} onClick={() => run(() => resignChess(code))} className="flex-1 rounded-full bg-rose-400 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:brightness-110">
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
          ))}
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
            {st.open_to_all && <p className="mt-1 text-sm text-mist">Your game is listed for other players.</p>}
            {st.bot_wait_s !== null && (
              <p className="mt-1 rounded-xl bg-amber-200/10 px-3 py-2 text-xs text-amber-100">
                🤖 If nobody joins in {Math.floor(botWait / 60)}:{String(botWait % 60).padStart(2, "0")}, the <b>House Bot</b> (a computer) may play you. Keep this page open, or share the link to find a real player first.
              </p>
            )}
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
            <button type="button" disabled={pending} onClick={() => run(() => cancelChess(code))} className={`${secondaryButtonClass} mt-3 w-full justify-center`}>
              Cancel game (stake back)
            </button>
          </>
        ) : (
          <>
            <h2 className="text-lg font-extrabold">{st.creator} is waiting for an opponent</h2>
            <p className="mt-1 text-sm text-mist">Join with {etbLabel(st.stake_units)}. The game starts right away and colours are drawn at random.</p>
            <button type="button" disabled={pending || !enough} onClick={() => run(() => joinChess(code))} className={`${primaryButtonClass} mt-3 disabled:opacity-50`}>
              {pending && <SpinnerIcon size={16} />} Join · {etbLabel(st.stake_units)}
            </button>
            {!enough && <p className="mt-2 text-xs text-amber-100">You need {etbLabel(st.stake_units - balanceUnits)} more. Ask the admin for a top-up.</p>}
          </>
        )}
      </section>
    </div>
  );
}
