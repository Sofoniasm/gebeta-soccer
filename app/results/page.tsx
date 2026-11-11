import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { calculateMatchPoints } from "@/lib/scoring";
import { formatKickoff, formatEtb } from "@/lib/format";
import { formatUnits, unitsToEtb } from "@/lib/money";
import type { MatchRow, RoundRow } from "@/lib/rounds";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "My results · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface Pred { match_id: number; predicted_home_score: number; predicted_away_score: number; points_earned: number | null }

export default async function ResultsPage() {
  const me = await getMe("/results");
  const supabase = await createClient();

  const { data: entries } = await supabase.from("round_entries").select("round_id").eq("user_id", me.id);
  const roundIds = (entries ?? []).map((e: { round_id: number }) => e.round_id);

  if (roundIds.length === 0) {
    return (
      <AppShell title="My results" next="/results">
        <div className="rounded-[2rem] border border-white/5 bg-card/60 p-10 text-center">
          <p className="font-bold">No rounds played yet</p>
          <p className="mt-1 text-sm text-mist">Join a round and your scores will appear here.</p>
          <Link href="/dashboard" className="mt-6 inline-flex rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
            Go to predictions
          </Link>
        </div>
      </AppShell>
    );
  }

  const [{ data: rounds }, { data: matches }, { data: payouts }] = await Promise.all([
    supabase.from("rounds").select("*").in("id", roundIds).order("id", { ascending: false }),
    supabase.from("matches").select("*").in("round_id", roundIds).order("kickoff_at"),
    supabase.from("wallet_ledger").select("round_id, amount_units").eq("user_id", me.id).eq("kind", "payout"),
  ]);
  const matchList = (matches ?? []) as MatchRow[];
  const { data: preds } = await supabase
    .from("predictions")
    .select("match_id, predicted_home_score, predicted_away_score, points_earned")
    .eq("user_id", me.id)
    .in("match_id", matchList.map((m) => m.id));
  const predByMatch = new Map(((preds ?? []) as Pred[]).map((p) => [p.match_id, p]));
  const payoutByRound = new Map<number, number>();
  for (const p of (payouts ?? []) as { round_id: number; amount_units: number }[]) {
    payoutByRound.set(p.round_id, (payoutByRound.get(p.round_id) ?? 0) + Number(p.amount_units));
  }

  // My rank in each round
  const ranks = new Map<number, number>();
  await Promise.all(
    ((rounds ?? []) as RoundRow[]).map(async (r) => {
      const { data } = await supabase.rpc("get_round_leaderboard", { p_round_id: r.id });
      const mine = ((data ?? []) as { rank: number; is_me: boolean }[]).find((x) => x.is_me);
      if (mine) ranks.set(r.id, Number(mine.rank));
    })
  );

  return (
    <AppShell title="My results" next="/results">
      <div className="space-y-4">
        {((rounds ?? []) as RoundRow[]).map((r, idx) => {
          const ms = matchList.filter((m) => m.round_id === r.id);
          const rows = ms.map((m) => {
            const p = predByMatch.get(m.id);
            const finished = m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null;
            const pts =
              p?.points_earned !== null && p?.points_earned !== undefined
                ? Number(p.points_earned)
                : p && finished
                  ? calculateMatchPoints(p.predicted_home_score, p.predicted_away_score, m.actual_home_score!, m.actual_away_score!)
                  : null;
            return { m, p, finished, pts };
          });
          const total = rows.reduce((s, x) => s + (x.pts ?? 0), 0);
          const won = payoutByRound.get(r.id);

          return (
            <details key={r.id} open={idx === 0} className="group overflow-hidden rounded-[2rem] border border-white/5 bg-card/60">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <p className="text-lg font-extrabold">{r.name}</p>
                  <p className="text-xs uppercase tracking-widest text-mist">{r.status === "settled" ? "Final" : r.status === "open" ? "Open" : "In progress"}</p>
                </div>
                <div className="flex items-center gap-3">
                  {ranks.has(r.id) && <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold">#{ranks.get(r.id)}</span>}
                  <span className="text-2xl font-extrabold text-lilac-soft">{total} pts</span>
                  {won && <span className="rounded-full bg-emerald-300/15 px-3 py-1 text-xs font-bold text-emerald-200">Won {formatEtb(unitsToEtb(won))}</span>}
                  <span className="text-mist transition group-open:rotate-180">▾</span>
                </div>
              </summary>
              <div className="divide-y divide-white/5 border-t border-white/5">
                {rows.map(({ m, p, finished, pts }) => (
                  <div key={m.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{m.home_team} vs {m.away_team}</p>
                      <p className="text-xs text-mist">{formatKickoff(m.kickoff_at)}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="text-mist">You: <b className="text-white">{p ? `${p.predicted_home_score}–${p.predicted_away_score}` : "—"}</b></p>
                      <p className="text-mist">Final: <b className="text-white">{finished ? `${m.actual_home_score}–${m.actual_away_score}` : m.status === "postponed" ? "PPD" : "—"}</b></p>
                    </div>
                    <span className={`w-14 text-right font-extrabold ${pts === null ? "text-mist/50" : pts >= 3 ? "text-lilac-soft" : pts > 0 ? "text-lilac" : "text-mist"}`}>
                      {pts === null ? "–" : `+${pts}`}
                    </span>
                  </div>
                ))}
              </div>
              {r.status === "settled" && !won && (
                <p className="border-t border-white/5 px-5 py-3 text-xs text-mist">Not a winner this time — entry was {formatUnits(Number(r.entry_fee_units))}.</p>
              )}
            </details>
          );
        })}
      </div>
    </AppShell>
  );
}
