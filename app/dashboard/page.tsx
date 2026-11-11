import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { getCurrentRound, getRoundMatches, getRoundPool } from "@/lib/rounds";
import { formatUnits, unitsToEtb } from "@/lib/money";
import { formatEtb } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Countdown } from "@/components/Countdown";
import PredictionBoard, { type SavedPrediction } from "./PredictionBoard";
import { TrophyIcon, UsersIcon } from "@/components/icons";

export const metadata = { title: "Predict · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const me = await getMe("/dashboard");
  const supabase = await createClient();

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

  const nextKickoff = matches.find((m) => m.status === "scheduled" && new Date(m.kickoff_at).getTime() > Date.now())?.kickoff_at;
  const predictedCount = saved.length;

  return (
    <AppShell next="/dashboard">
      {round ? (
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
