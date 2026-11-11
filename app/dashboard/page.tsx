import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRound, getRoundMatches, getRoundPool } from "@/lib/rounds";
import { formatUnits, unitsToEtb } from "@/lib/money";
import { formatEtb } from "@/lib/format";
import { signOut } from "../(auth)/actions";
import PredictionBoard, { type SavedPrediction } from "./PredictionBoard";
import { Logo } from "@/components/ui";
import { LogOutIcon, ShieldIcon, TrophyIcon, WalletIcon } from "@/components/icons";

export const metadata = { title: "Dashboard · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, balance_units, is_admin")
    .eq("id", user.id)
    .single();

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
      .eq("user_id", user.id)
      .maybeSingle();
    entered = !!entry;

    if (matches.length > 0) {
      const { data } = await supabase
        .from("predictions")
        .select("match_id, predicted_home_score, predicted_away_score, points_earned")
        .eq("user_id", user.id)
        .in("match_id", matches.map((m) => m.id));
      saved = (data ?? []).map((p: SavedPrediction) => ({ ...p, points_earned: p.points_earned === null ? null : Number(p.points_earned) }));
    }
  }

  const balance = Number(profile?.balance_units ?? 0);

  return (
    <main className="mx-auto min-h-dvh max-w-lg px-4 pt-4">
      {/* Header */}
      <header className="sticky top-0 z-10 -mx-4 mb-4 border-b border-white/5 bg-pitch/85 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            {profile?.is_admin && (
              <Link href="/admin" className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Admin">
                <ShieldIcon size={18} />
              </Link>
            )}
            <form action={signOut}>
              <button className="rounded-lg p-2 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Sign out">
                <LogOutIcon size={18} />
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Player + wallet */}
      <section className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-xs text-neutral-400">Player</p>
          <p className="mt-1 truncate text-lg font-bold">{profile?.username ?? "—"}</p>
        </div>
        <div className="rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/15 to-transparent p-4">
          <p className="flex items-center gap-1.5 text-xs text-emerald-300"><WalletIcon size={14} /> Wallet</p>
          <p className="mt-1 text-lg font-bold">{formatUnits(balance).split(" / ")[0]}</p>
          <p className="text-xs text-neutral-400">{formatEtb(unitsToEtb(balance))}</p>
        </div>
      </section>

      {/* Round header */}
      {round ? (
        <section className="mb-4 rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-800/60 to-neutral-900 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-wider text-neutral-400">
                {round.status === "open" ? "Current round" : round.status === "locked" ? "In progress" : "Last round"}
              </p>
              <h1 className="text-xl font-bold">{round.name}</h1>
            </div>
            {pool && (
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-xs text-amber-300"><TrophyIcon size={14} /> Prize pot</p>
                <p className="text-xl font-black text-amber-300">{formatEtb(unitsToEtb(pool.prize_fund_units))}</p>
                <p className="text-xs text-neutral-500">{pool.entrants} players</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <p className="rounded-2xl border border-white/10 p-6 text-center text-neutral-400">No round yet — check back soon.</p>
      )}

      {round && (
        <PredictionBoard
          roundId={round.id}
          roundOpen={round.status === "open"}
          entered={entered}
          entryFeeLabel={formatUnits(Number(round.entry_fee_units))}
          matches={matches}
          saved={saved}
        />
      )}
    </main>
  );
}
