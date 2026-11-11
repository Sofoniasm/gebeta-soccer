import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { getCurrentRound, getRoundMatches, getRoundPool } from "@/lib/rounds";
import { formatUnits, unitsToEtb } from "@/lib/money";
import { formatEtb } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Countdown } from "@/components/Countdown";
import PredictionBoard, { type SavedPrediction } from "./PredictionBoard";
import { ClockIcon, TrophyIcon, UsersIcon } from "@/components/icons";
import { getTodo, picksNeededWithin } from "@/lib/todo";
import { MatchLine, PointsChip, groupByDay } from "@/components/MatchLine";
import type { MatchRow } from "@/lib/rounds";
import { calculateMatchPoints } from "@/lib/scoring";

export const metadata = { title: "Predict · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await getMe("/dashboard");
  const supabase = await createClient();
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "results" ? "results" : "upcoming";
  const todo = await getTodo();

  const round = await getCurrentRound(supabase);
  const matches = round ? await getRoundMatches(supabase, round.id) : [];
  const pool = round ? await getRoundPool(supabase, round.id) : null;

  let entered = false;
  let saved: SavedPrediction[] = [];
  if (round) {
    const { data: entry } = await supabase
      .from("round_entries")
      .select("round_id")
      .eq("round_id", round.id)
      .eq("user_id", me.id)
      .maybeSingle();
    entered = !!entry;

    if (matches.length > 0) {
      const { data } = await supabase
        .from("predictions")
        .select("match_id, predicted_home_score, predicted_away_score, points_earned")
        .eq("user_id", me.id)
        .in("match_id", matches.map((m) => m.id));
      saved = (data ?? []).map((p: SavedPrediction) => ({
        ...p,
        points_earned: p.points_earned === null ? null : Number(p.points_earned),
      }));
    }
  }

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

  const nextKickoff = matches.find((m) => m.status === "scheduled" && new Date(m.kickoff_at).getTime() > Date.now())?.kickoff_at;
  const predictedCount = saved.length;

  return (
    <AppShell next="/dashboard">
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
                {n} pick{n === 1 ? "" : "s"} needed
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
                </p>
              </div>
              {pool && (
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">
                    <TrophyIcon size={13} /> Prize pot
                  </p>
                  <p className="text-3xl font-extrabold text-white">{formatEtb(unitsToEtb(pool.prize_fund_units))}</p>
                  <p className="flex items-center justify-end gap-1 text-xs text-mist">
                    <UsersIcon size={13} /> {pool.entrants} player{pool.entrants === 1 ? "" : "s"}
                  </p>
                </div>
              )}
            </div>
            <div className="relative mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
              {nextKickoff && round.status === "open" ? <Countdown to={nextKickoff} /> : <span className="text-xs text-mist">All matches have kicked off</span>}
              {entered && (
                <span className="rounded-full bg-lilac/15 px-3 py-1 text-xs font-bold text-lilac-soft">
                  {predictedCount}/{matches.length} predicted
                </span>
              )}
              <Link href="/leaderboard" className="text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
                Leaderboard →
              </Link>
            </div>
          </section>

          <PredictionBoard
            roundId={round.id}
            roundOpen={round.status === "open"}
            entered={entered}
            entryFeeLabel={formatUnits(Number(round.entry_fee_units))}
            balanceUnits={me.balance_units}
            entryFeeUnits={Number(round.entry_fee_units)}
            matches={matches}
            saved={saved}
          />
        </>
      ) : (
        <div className="rounded-[2rem] border border-white/5 bg-card/60 p-10 text-center">
          <p className="text-lg font-bold">No round yet</p>
          <p className="mt-1 text-sm text-mist">The next round opens soon. Top up your wallet so you&apos;re ready.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/wallet" className="rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
              Top up wallet
            </Link>
            {me.is_admin && (
              <Link href="/admin" className="rounded-full border border-white/60 px-5 py-2.5 text-xs font-bold uppercase tracking-wider hover:bg-white/10">
                Create the first round →
              </Link>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
