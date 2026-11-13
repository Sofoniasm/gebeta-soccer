import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { getActiveRounds, getCurrentRound, getRoundMatches, getRoundPool } from "@/lib/rounds";
import { formatKickoff } from "@/lib/format";
import { formatUnits, unitsToEtb } from "@/lib/money";
import { formatEtb } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Countdown } from "@/components/Countdown";
import PredictionBoard, { type SlipData } from "./PredictionBoard";
import { ClockIcon, TrophyIcon, UsersIcon } from "@/components/icons";
import { getTodo, picksNeededWithin } from "@/lib/todo";
import { MatchLine, PointsChip, groupByDay } from "@/components/MatchLine";
import type { MatchRow } from "@/lib/rounds";
import { calculateMatchPoints } from "@/lib/scoring";
import { RecentWinners } from "@/components/RecentWinners";
import { CrowdPicks } from "@/components/CrowdPicks";
import { getMyPremium } from "@/lib/premium";
import { formChances, getForm, type Chances } from "@/lib/form";
import { slotHours, slotInfo, type Slot } from "@/lib/round-slots";

export const metadata = { title: "Predict · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string; round?: string }> }) {
  const me = await getMe("/dashboard");
  const supabase = await createClient();
  const { tab: tabParam, round: roundParam } = await searchParams;
  const tab = tabParam === "results" ? "results" : "upcoming";
  const todo = await getTodo();

  // Only an open/in-progress round is "active". A settled one moves to Results.
  // Daily rounds: several can be open at once; ?round=<id> picks one (default: closing soonest).
  const active = await getActiveRounds(supabase, { includeTest: me.is_admin });
  const round = active.find((r) => String(r.id) === roundParam) ?? active[0] ?? null;
  const current = round ? null : await getCurrentRound(supabase, { includeTest: me.is_admin });
  const lastSettled = current?.status === "settled" ? current : null;
  const matches = round ? await getRoundMatches(supabase, round.id) : [];
  const pool = round ? await getRoundPool(supabase, round.id) : null;

  let leagueNames: string[] = [];
  let slips: SlipData[] = [];
  if (round) {
    const { data: slipRows } = await supabase
      .from("slips")
      .select("id, slip_no, slip_picks(match_id, home, away, points_earned)")
      .eq("round_id", round.id)
      .eq("user_id", me.id)
      .order("slip_no");
    slips = ((slipRows ?? []) as unknown as {
      id: number;
      slip_no: number;
      slip_picks: { match_id: number; home: number; away: number; points_earned: number | null }[];
    }[]).map((sl) => ({
      id: sl.id,
      slip_no: sl.slip_no,
      picks: Object.fromEntries(
        sl.slip_picks.map((p) => [p.match_id, { home: p.home, away: p.away, points: p.points_earned === null ? null : Number(p.points_earned) }]),
      ),
    }));

    const { data: myLeagues } = await supabase
      .from("league_members")
      .select("leagues!inner(name, round_id)")
      .eq("user_id", me.id)
      .eq("status", "active")
      .eq("leagues.round_id", round.id);
    leagueNames = ((myLeagues ?? []) as unknown as { leagues: { name: string } }[]).map((l) => l.leagues.name);
  }
  // The whole round locks at its first kickoff.
  const kickoffs = matches.filter((m) => !["postponed", "cancelled"].includes(m.status)).map((m) => new Date(m.kickoff_at).getTime());
  const lockAt = kickoffs.length ? new Date(Math.min(...kickoffs)).toISOString() : null;
  const bettable = !!round && round.status === "open" && matches.length === 10 && !!lockAt && new Date(lockAt).getTime() > Date.now();

  // ---- Live & Results: matches that kicked off in the last 14 days
  let recent: MatchRow[] = [];
  const myPick = new Map<number, { h: number; a: number; pts: number | null; def: boolean }>();
  if (tab === "results") {
    const { data: rec } = await supabase
      .from("matches")
      .select("*")
      .lte("kickoff_at", new Date().toISOString())
      .gte("kickoff_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
      .not("round_id", "is", null)
      .order("kickoff_at", { ascending: false })
      .limit(60);
    recent = (rec ?? []) as MatchRow[];
    if (recent.length) {
      const { data: mp } = await supabase
        .from("predictions")
        .select("match_id, predicted_home_score, predicted_away_score, points_earned, is_default")
        .eq("user_id", me.id)
        .in("match_id", recent.map((m) => m.id));
      for (const p of (mp ?? []) as { match_id: number; predicted_home_score: number; predicted_away_score: number; points_earned: number | null; is_default: boolean }[]) {
        const m = recent.find((x) => x.id === p.match_id)!;
        const pts =
          p.points_earned !== null
            ? Number(p.points_earned)
            : m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null
              ? calculateMatchPoints(p.predicted_home_score, p.predicted_away_score, m.actual_home_score, m.actual_away_score)
              : null;
        myPick.set(p.match_id, { h: p.predicted_home_score, a: p.predicted_away_score, pts, def: p.is_default });
      }
    }
  }


  const premium = (await getMyPremium(supabase, me.id)).active;
  // Team form (last 5 results) on every pick card; Premium also gets a rough result guide.
  const form = matches.length ? await getForm(supabase, matches.flatMap((m) => [m.home_team, m.away_team])) : {};
  const chances: Record<number, Chances> = {};
  if (premium) {
    for (const m of matches) {
      const c = formChances(form[m.home_team] ?? [], form[m.away_team] ?? []);
      if (c) chances[m.id] = c;
    }
  }

  // Nothing open: show the next matches so the page is never empty.
  let upcoming: MatchRow[] = [];
  if (!round && tab !== "results") {
    const { data: up } = await supabase
      .from("matches")
      .select("*")
      .eq("status", "scheduled")
      .gt("kickoff_at", new Date().toISOString())
      .order("kickoff_at", { ascending: true })
      .limit(5);
    upcoming = (up ?? []) as MatchRow[];
  }

  return (
    <AppShell next="/dashboard">
      {active.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {active.map((r) => {
            const on = r.id === round?.id;
            return (
              <Link
                key={r.id}
                href={`/dashboard?round=${r.id}`}
                className={`shrink-0 rounded-2xl border px-4 py-2.5 ${on ? "border-lilac bg-lilac/15" : "border-white/10 bg-card/60 hover:border-white/30"}`}
              >
                <span className="block max-w-[13rem] truncate text-sm font-extrabold">
                  {slotInfo(r.auto_slot)?.emoji ? `${slotInfo(r.auto_slot)!.emoji} ` : ""}
                  {r.name}
                </span>
                <span className={`block text-[11px] ${r.bettable ? "text-emerald-200" : "text-mist"}`}>
                  {r.bettable && r.lock_at ? `Open · locks ${formatKickoff(r.lock_at)} EAT` : "In play"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
      <Link
        href="/challenges"
        className="mb-4 flex items-center gap-3 rounded-2xl border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent px-4 py-3 transition hover:border-lilac/50"
      >
        <span className="text-xl">🤝</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-extrabold text-white">Challenge a friend</span>
          <span className="block truncate text-xs text-mist">Pick 1 to 10 matches, set your own stake, share the link</span>
        </span>
        <span className="text-xs font-bold uppercase tracking-wider text-lilac">Start →</span>
      </Link>
      {/* Superbru-style "picks needed" countdown chips */}
      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        {[24, 48, 72].map((h) => {
          const n = picksNeededWithin(todo, h);
          return (
            <Link
              key={h}
              href="/todo"
              className={`rounded-2xl border px-3 py-3 transition hover:border-lilac/50 ${
                n > 0 ? "border-rose-300/30 bg-rose-400/10" : "border-white/5 bg-card/50"
              }`}
            >
              <p className="flex items-center gap-1.5 text-xs font-bold text-mist">
                <ClockIcon size={13} /> {h} hours
              </p>
              <p className={`mt-0.5 text-sm font-extrabold ${n > 0 ? "text-rose-100" : "text-emerald-200"}`}>
                {n > 0 ? `${n} slip${n === 1 ? "" : "s"} to place` : "All set"}
              </p>
            </Link>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="mb-5 inline-flex rounded-full border border-white/10 bg-ink/60 p-1">
        {[
          { key: "upcoming", label: "Upcoming" },
          { key: "results", label: "Live & Results" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.key === "upcoming" ? "/dashboard" : "/dashboard?tab=results"}
            className={`rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition ${
              tab === t.key ? "bg-lilac text-ink" : "text-mist hover:text-white"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "results" ? (
        recent.length === 0 ? (
          <div className="rounded-[2rem] border border-white/5 bg-card/60 p-10 text-center">
            <p className="text-lg font-bold">No results yet</p>
            <p className="mt-1 text-sm text-mist">Matches from your rounds appear here once they kick off.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {groupByDay(recent).map((g) => (
              <section key={g.key}>
                <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.15em] text-lilac">{g.label}</h2>
                <div className="space-y-2">
                  {g.matches.map((m) => {
                    const p = myPick.get(m.id);
                    return (
                      <MatchLine
                        key={m.id}
                        m={m}
                        right={
                          p ? (
                            <>
                              <span className="font-bold text-white">
                                {p.h}–{p.a}
                                {p.def && <span className="ml-1 text-[10px] text-amber-200" title="Default pick">D</span>}
                              </span>
                              <PointsChip points={p.pts} />
                            </>
                          ) : (
                            <span className="text-mist/60">no pick</span>
                          )
                        }
                      />
                    );
                  })}
                </div>
              </section>
            ))}
            <p className="text-center text-xs text-mist">Tap a match to see everyone&apos;s picks.</p>
          </div>
        )
      ) : round ? (
        <>
          {/* Round hero */}
          <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-br from-[#3a3166] via-card to-ink p-6">
            <div className="animate-glow pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lilac/25 blur-3xl" />
            <div className="relative flex flex-wrap items-start justify-between gap-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">
                  {round.status === "open" ? "Current round" : round.status === "locked" ? "In progress" : "Last round"}
                </p>
                <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{round.name}</h1>
                <p className="mt-1 text-sm text-mist">
                  {matches.length} matches · entry {formatUnits(Number(round.entry_fee_units))}
                  {round.auto_slot && slotInfo(round.auto_slot) ? ` · ${slotInfo(round.auto_slot)!.emoji} all kickoffs ${slotHours(round.auto_slot as Slot)}` : ""}
                </p>
                {lockAt && (
                  <p className="mt-1 text-sm font-semibold text-white">
                    🔒 {round.status === "open" && bettable ? "Locks" : "Locked"} at {formatKickoff(lockAt)} EAT
                    <span className="font-normal text-mist"> (first kickoff)</span>
                  </p>
                )}
              </div>
              {pool && (
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">
                    <TrophyIcon size={13} /> Prize pot
                  </p>
                  <p className="text-3xl font-extrabold text-white">{formatEtb(unitsToEtb(pool.prize_fund_units))}</p>
                  <p className="text-[11px] text-mist">
                    winners&apos; share: 70% of {formatEtb(unitsToEtb(pool.entrants * Number(round.entry_fee_units)))} in bets
                  </p>
                  <p className="flex items-center justify-end gap-1 text-xs text-mist">
                    <UsersIcon size={13} /> {pool.entrants} slip{pool.entrants === 1 ? "" : "s"} · {pool.players} player{pool.players === 1 ? "" : "s"}
                  </p>
                </div>
              )}
            </div>
            <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              {bettable && lockAt ? (
                <Countdown to={lockAt} label="Betting closes in" />
              ) : (
                <span className="text-xs font-bold uppercase tracking-widest text-rose-200">Betting closed</span>
              )}
              {slips.length > 0 && (
                <span className="rounded-full bg-lilac/15 px-3 py-1 text-xs font-bold text-lilac-soft">
                  {slips.length} slip{slips.length === 1 ? "" : "s"} placed
                </span>
              )}
              <Link href="/leaderboard" className="text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
                Leaderboard →
              </Link>
            </div>
          </section>

          {leagueNames.length > 0 && (
            <p className="mb-4 rounded-2xl border border-lilac/20 bg-lilac/10 p-3 text-sm text-mist">
              🏳️ Your <b className="text-white">Slip #1</b> also counts in your league{leagueNames.length === 1 ? "" : "s"}:{" "}
              <b className="text-white">{leagueNames.join(", ")}</b>
              {slips.length === 0 && " — place a slip to play."}
            </p>
          )}

          <PredictionBoard
            roundId={round.id}
            bettable={bettable}
            entryFeeLabel={formatUnits(Number(round.entry_fee_units))}
            balanceUnits={me.balance_units}
            entryFeeUnits={Number(round.entry_fee_units)}
            matches={matches}
            slips={slips}
            form={form}
            chances={premium ? chances : undefined}
          />
          {/* Premium before the lock; free for everyone once the round has locked. */}
          <CrowdPicks roundId={round.id} matches={matches} premium={premium || !bettable} locked={!bettable} />
        </>
      ) : (
        <>
        <div className="rounded-[2rem] border border-white/5 bg-card/60 p-6 text-center sm:p-10">
          <p className="text-lg font-bold">Waiting for the next round</p>
          <p className="mt-1 text-sm text-mist">
            Rounds open by themselves: 🌅 Morning (06–12), 🌇 Evening (12–19) and 🌙 Night (19–24), Ethiopian time, whenever a slot has 10 matches.
          </p>
          {upcoming.length === 0 && (
            <p className="mx-auto mt-4 max-w-xl rounded-2xl border border-amber-200/20 bg-amber-200/5 px-4 py-3 text-sm text-amber-50">
              ⚽ No league matches in the next few days, usually an international break. Rounds open by themselves as soon as the leagues are back.
            </p>
          )}
          {upcoming.length > 0 && (
            <div className="mx-auto mt-5 max-w-xl text-left">
              <div className="mb-3 flex justify-center">
                <Countdown to={upcoming[0].kickoff_at} label="Next kickoff in" />
              </div>
              <div className="space-y-2">
                {upcoming.map((m) => (
                  <MatchLine key={m.id} m={m} sub={<span className="text-[11px] text-mist">{formatKickoff(m.kickoff_at)} EAT</span>} />
                ))}
              </div>
            </div>
          )}
          <p className="mt-1 text-sm text-mist">
            {lastSettled ? (
              <>
                <b className="text-white">{lastSettled.name}</b> is finished.{" "}
                <Link href="/results" className="font-bold text-lilac hover:text-lilac-soft">See the results →</Link>{" "}
              </>
            ) : null}
            Top up your wallet so you&apos;re ready.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/wallet" className="rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
              Top up wallet
            </Link>
            {me.is_admin && (
              <Link href="/admin" className="rounded-full border border-white/60 px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-white/10">
                Create a round now →
              </Link>
            )}
          </div>
        </div>
        </>
      )}
      {tab !== "results" && <RecentWinners />}
    </AppShell>
  );
}
