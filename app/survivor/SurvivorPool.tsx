"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Banner, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SendIcon, SpinnerIcon } from "@/components/icons";
import { etbLabel } from "@/lib/money";
import { challengePrizeUnits } from "@/lib/challenges";
import { survivorDayLabel, survivorStatusLabel, type SurvivorState } from "@/lib/survivor";
import { joinSurvivor, leaveSurvivor, pickSurvivor, startSurvivor } from "./actions";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

function fmtKick(ms: number) {
  return new Date(ms).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Addis_Ababa" }) + " EAT";
}
function fmtLeft(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

/** The pool: lobby, the daily pick board, and the results. The server decides who is alive; this screen only shows it. */
export function SurvivorPool({ code, initial, balanceUnits, url }: { code: string; initial: SurvivorState; balanceUnits: number; url: string }) {
  const [st, setSt] = useState<SurvivorState>(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const gotAt = useRef(0);
  const statusRef = useRef(st.status);
  const [, force] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/survivor/${encodeURIComponent(code)}`, { cache: "no-store" });
      const d = (await res.json()) as SurvivorState | { error: string } | null;
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

  // poll every 5 s in the lobby, every 20 s while live, never after the end
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (stopped) return;
      const s = statusRef.current;
      if (s === "settled" || s === "refunded" || s === "cancelled") return;
      await refresh();
      if (stopped) return;
      timer = setTimeout(loop, statusRef.current === "live" ? 20000 : 5000);
    };
    timer = setTimeout(loop, 5000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  function run(fn: () => Promise<{ ok: boolean; message: string }>) {
    setMsg(null);
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      await refresh();
    });
  }

  const me = st.players.find((p) => p.is_me);
  const pot = st.stake_units * st.players.length;
  const prize = challengePrizeUnits(st.stake_units, st.players.length);
  const lockLeft = st.lock_ms === null ? null : st.lock_ms - (st.now_ms + (performance.now() - gotAt.current));
  const locked = st.locked || (lockLeft !== null && lockLeft <= 0);
  const full = st.players.length >= st.max_players;
  const enough = balanceUnits >= st.stake_units;
  const canStart = st.is_creator && st.players.length >= st.min_players;
  const finished = st.status === "settled" || st.status === "refunded" || st.status === "cancelled";
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(`🛡️ Join my Survivor pool on GebetaSoccer! Pick one winning team a day: last one standing wins. ${etbLabel(st.stake_units)} entry. Code ${st.code}`)}`;

  function pick(matchId: number, side: "home" | "away") {
    run(() => pickSurvivor(code, matchId, side));
  }

  // ------------------------------------------------------------------ header
  const header = (
    <section className="relative overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-lilac/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-lilac-soft">{survivorStatusLabel(st.status)}</span>
        <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{st.code} · by {st.creator}</span>
      </div>
      <h1 className="mt-2 text-2xl font-extrabold">🛡️ Survivor pool</h1>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-ink/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Entry</p>
          <p className="mt-1 text-sm font-extrabold sm:text-lg">{etbLabel(st.stake_units)}</p>
        </div>
        <div className="rounded-2xl bg-ink/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mist">{st.status === "live" ? "Alive" : "Players"}</p>
          <p className="mt-1 text-sm font-extrabold sm:text-lg">{st.status === "live" ? st.alive_count : st.players.length}<span className="text-xs font-bold text-mist"> / {st.status === "live" ? st.players.length : st.max_players}</span></p>
        </div>
        <div className="rounded-2xl bg-ink/50 p-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Winner gets</p>
          <p className="mt-1 text-sm font-extrabold text-lilac-soft sm:text-lg">{etbLabel(prize)}</p>
        </div>
      </div>
      <p className="mt-3 text-xs text-mist">
        Pot {etbLabel(pot)}. Each match day pick ONE team to win: win = you survive, draw or loss = you&apos;re out, and you can&apos;t use a team twice. Last one standing takes their entry back + 90% of the others&apos; entries.
        If everyone left is out on the same day, they share. Longest game: {st.max_days} match days.
        {st.status === "open" && ` Needs ${st.min_players} players to start; if it doesn't start within ${Math.max(1, Math.ceil(st.expires_in_s / 3600))} h, every entry is refunded.`}
      </p>
    </section>
  );

  // ------------------------------------------------------------------ the players list
  const playersCard = (
    <section className={card}>
      <h2 className="mb-3 text-lg font-extrabold">{st.status === "open" ? "Who's in" : "Players"}</h2>
      <ul className="divide-y divide-white/5">
        {st.players.map((p) => (
          <li key={p.username} className={`flex items-center gap-3 py-2.5 ${p.is_me ? "font-bold text-white" : ""}`}>
            <span className="w-6 text-center text-base">{st.status === "open" ? "👤" : p.payout ? "🏆" : p.alive ? "🟢" : "💀"}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{p.username}{p.is_me && " (you)"}{p.is_creator && " 👑"}</p>
              {st.status === "live" && !p.alive && p.out_reason && <p className="text-xs text-rose-200">Out: {p.out_reason}{p.out_day ? ` (${survivorDayLabel(p.out_day)})` : ""}</p>}
              {st.status === "live" && p.alive && st.current_day && (
                <p className="text-xs text-mist">{locked ? (p.pick_team ? `Picked ${p.pick_team}` : "No pick") : p.picked ? "Picked ✓" : "Hasn't picked yet"}</p>
              )}
              {finished && !p.alive && p.out_reason && <p className="text-xs text-mist">Out: {p.out_reason}</p>}
            </div>
            {p.payout ? <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-bold text-emerald-200">+{etbLabel(p.payout)}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );

  // ------------------------------------------------------------------ history
  const historyCard =
    st.history.length > 0 ? (
      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">Picks so far</h2>
        <div className="space-y-4">
          {st.history.map((h) => (
            <div key={h.day}>
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-mist">{survivorDayLabel(h.day)}</p>
              <ul className="space-y-1">
                {h.picks.map((p) => (
                  <li key={p.username} className="flex items-center gap-2 text-sm">
                    <span>{p.result === "won" ? "✅" : p.result === "lost" ? "❌" : p.result === "void" ? "↩️" : "⏳"}</span>
                    <span className="min-w-0 flex-1 truncate">{p.username}</span>
                    <span className="text-mist">{p.team}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    ) : null;

  // ------------------------------------------------------------------ results
  if (finished) {
    const won = me?.payout && me.payout > 0;
    return (
      <div className="space-y-5">
        <section className={`${card} text-center`}>
          <p className="text-4xl">{st.status === "cancelled" ? "↩️" : won ? "🏆" : "📊"}</p>
          <h2 className="mt-2 text-2xl font-extrabold">
            {st.status === "cancelled" ? "Pool cancelled" : won ? `You won ${etbLabel(me!.payout!)}!` : "Pool over"}
          </h2>
          <p className="mt-1 text-sm text-mist">
            {st.status === "cancelled" ? "Everyone's entry went back to their wallet." : won ? "Your winnings are in your wallet." : "Thanks for playing. Start another pool and get your revenge!"}
          </p>
        </section>
        {playersCard}
        {historyCard}
        <a href="/survivor" className={`${primaryButtonClass} w-full justify-center`}>Play again</a>
      </div>
    );
  }

  // ------------------------------------------------------------------ live pool
  if (st.status === "live") {
    const alive = !!me?.alive;
    return (
      <div className="space-y-5">
        {header}
        {msg && <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>}
        {st.is_member && (
          <section className={card}>
            {st.waiting_next_day || !st.current_day ? (
              <p className="text-sm text-mist">⏳ Waiting for the next match day (we need a day with at least 4 matches). We&apos;ll message you when it opens.</p>
            ) : !alive ? (
              <p className="text-sm text-rose-200">💀 You&apos;re out{me?.out_reason ? `: ${me.out_reason}` : ""}. Follow the pool below: you can still see everyone&apos;s picks.</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-extrabold">Pick one team to win · {survivorDayLabel(st.current_day)}</h2>
                  <span className={`text-xs font-bold uppercase tracking-widest ${!locked && lockLeft !== null && lockLeft < 3600000 ? "text-rose-300" : "text-mist"}`}>
                    {locked ? "Picks locked 🔒" : lockLeft !== null ? `Locks in ${fmtLeft(lockLeft)}` : ""}
                  </span>
                </div>
                <p className="mb-3 text-xs text-mist">
                  {locked ? "The first match has kicked off: picks are final and everyone's picks are visible." : "You can change your pick until the first kickoff. Others can't see it before then."}
                  {st.used_teams.length > 0 && <> Already used: {st.used_teams.join(", ")}.</>}
                </p>
                <ul className="space-y-2">
                  {st.matches.map((m) => {
                    const sides: ("home" | "away")[] = ["home", "away"];
                    return (
                      <li key={m.id} className="rounded-2xl border border-white/5 bg-ink/40 p-3">
                        <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-mist">
                          {m.competition ?? "Match"} · {fmtKick(m.kickoff_ms)}
                          {m.status === "finished" && m.home_score !== null && ` · FT ${m.home_score}-${m.away_score}`}
                          {m.status === "live" && " · LIVE"}
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          {sides.map((side) => {
                            const team = side === "home" ? m.home : m.away;
                            const mine = st.my_pick?.match_id === m.id && st.my_pick.side === side;
                            const used = st.used_teams.includes(team);
                            return (
                              <button
                                key={side}
                                type="button"
                                disabled={pending || locked || used || m.status !== "scheduled"}
                                onClick={() => pick(m.id, side)}
                                className={`rounded-xl border px-3 py-3 text-sm font-bold transition disabled:opacity-40 ${mine ? "border-lilac bg-lilac/25 text-white" : "border-white/10 text-white hover:border-white/30"}`}
                              >
                                {mine ? "✓ " : ""}{team}
                                <span className="block text-[10px] font-semibold uppercase tracking-wider text-mist">{side === "home" ? "home win" : "away win"}{used ? " · used" : ""}</span>
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!locked && !st.my_pick && <p className="mt-3 text-xs text-amber-100">You haven&apos;t picked yet: no pick by the first kickoff means you&apos;re out!</p>}
              </>
            )}
          </section>
        )}
        {playersCard}
        {historyCard}
      </div>
    );
  }

  // ------------------------------------------------------------------ lobby (open)
  return (
    <div className="space-y-5">
      {header}
      {msg && <Banner kind={msg.ok ? "success" : "error"}>{msg.text}</Banner>}
      <section className={card}>
        {playersCard.props.children}
        <div className="mt-4 flex flex-wrap gap-2">
          {!st.is_member && !full && (
            <button type="button" disabled={pending || !enough} onClick={() => run(() => joinSurvivor(code))} className={`${primaryButtonClass} disabled:opacity-50`}>
              {pending && <SpinnerIcon size={16} />} Join · {etbLabel(st.stake_units)}
            </button>
          )}
          {!st.is_member && !enough && <p className="w-full text-xs text-amber-100">You need {etbLabel(st.stake_units - balanceUnits)} more. Ask the admin for a top-up.</p>}
          {!st.is_member && full && <p className="text-sm text-mist">This pool is full.</p>}
          {st.is_member && st.is_creator && (
            <button type="button" disabled={pending || !canStart} onClick={() => run(() => startSurvivor(code))} className={`${primaryButtonClass} disabled:opacity-50`}>
              {pending && <SpinnerIcon size={16} />} Start the pool{!canStart ? ` (need ${st.min_players - st.players.length} more)` : ""}
            </button>
          )}
          {st.is_member && (
            <button type="button" disabled={pending} onClick={() => run(() => leaveSurvivor(code))} className={secondaryButtonClass}>
              {st.is_creator ? "Cancel pool" : "Leave"} (entry back)
            </button>
          )}
        </div>
      </section>

      {st.is_member && (
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
