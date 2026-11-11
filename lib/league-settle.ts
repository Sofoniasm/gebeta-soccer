/**
 * Settle one private league with the same scoring as rounds:
 * league members only, 70% of the league pot to the winner(s) (ties share),
 * 30% house. Paid leagues use the same winning bar as the main pool: the
 * winner needs MORE than half the match points (more than 15 of 30), else
 * the house keeps the league pot. Free leagues settle with no money moving.
 * Server only (uses the secret-key client).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { settleRound } from "@/lib/settlement";
import { winningBar } from "@/lib/scoring";

export interface LeagueSettleResult {
  ok: boolean;
  message: string;
  winners?: string[];
}

export async function settleLeague(leagueId: number, adminId: string): Promise<LeagueSettleResult> {
  const admin = createAdminClient();
  const { data: league } = await admin.from("leagues").select("*").eq("id", leagueId).single();
  if (!league) return { ok: false, message: "League not found." };
  if (league.status !== "open") return { ok: false, message: `League already ${league.status}.` };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = any;
  const { data: matches } = await admin.from("matches").select("*").eq("round_id", league.round_id);
  const list: Row[] = matches ?? [];
  if (list.some((m: Row) => !["finished", "cancelled", "postponed"].includes(m.status))) {
    return { ok: false, message: `${league.name}: not all matches are finished yet.` };
  }

  // Forgotten picks get the default (most popular) pick, like the main round.
  await admin.rpc("apply_default_picks", { p_round_id: league.round_id });

  const { data: members } = await admin.from("league_members").select("user_id").eq("league_id", leagueId).eq("status", "active");
  const memberIds = ((members ?? []) as Row[]).map((m) => m.user_id as string);
  const { data: preds } = memberIds.length
    ? await admin
        .from("predictions")
        .select("id, user_id, match_id, predicted_home_score, predicted_away_score")
        .in("match_id", list.map((m: Row) => m.id))
        .in("user_id", memberIds)
    : { data: [] };

  const results = list
    .filter((m: Row) => m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null)
    .map((m: Row) => ({ matchId: m.id, homeScore: m.actual_home_score, awayScore: m.actual_away_score }));
  const paidLeague = Number(league.entry_fee_units) > 0;
  const result = settleRound({
    entrantIds: memberIds,
    entryFeeUnits: Number(league.entry_fee_units),
    houseCut: Number(league.house_cut),
    // Paid leagues: same winning bar as the main pool.
    ...(paidLeague ? { minMatchPoints: winningBar(results.length) } : {}),
    results,
    predictions: ((preds ?? []) as Row[]).map((p) => ({
      predictionId: p.id,
      userId: p.user_id,
      matchId: p.match_id,
      predictedHome: p.predicted_home_score,
      predictedAway: p.predicted_away_score,
    })),
  });

  const rankOf = new Map(result.standings.map((s) => [s.userId, s.rank]));
  const payouts = result.payouts
    .filter((p) => p.units > 0)
    .map((p) => ({ user_id: p.userId, units: p.units, rank: rankOf.get(p.userId) ?? 1 }));

  const { error } = await admin.rpc("settle_league", { p_league_id: leagueId, p_payouts: payouts, p_admin_id: adminId });
  if (error) return { ok: false, message: `${league.name}: ${error.message}` };

  // Tell every member how they finished (winners also get "You won!" from the wallet).
  const total = result.standings.length;
  const winnerIds = new Set(payouts.map((p) => p.user_id));
  const notes = result.standings
    .filter((s) => !winnerIds.has(s.userId))
    .map((s) => ({
      user_id: s.userId,
      kind: "league_result",
      title: `📊 ${league.name}: final table`,
      body:
        `You finished #${s.rank} of ${total} with ${s.totalPoints} points.` +
        (result.barMet ? "" : ` Nobody scored more than ${result.winningBar} match points, so the league pot goes to the house.`),
      link: `/leagues/${league.code}`,
    }));
  if (notes.length) await admin.from("notifications").insert(notes);

  const { data: names } = winnerIds.size
    ? await admin.from("profiles").select("username").in("id", [...winnerIds])
    : { data: [] };
  const winners = ((names ?? []) as Row[]).map((n) => n.username as string);
  const paid = payouts.reduce((s, p) => s + p.units, 0);
  return {
    ok: true,
    winners,
    message:
      Number(league.entry_fee_units) > 0
        ? result.barMet
          ? `${league.name}: paid ${paid} Units to ${winners.join(", ") || "nobody"}.`
          : `${league.name}: no winner (best ${result.topMatchPoints}, bar more than ${result.winningBar}); house keeps the pot.`
        : `${league.name}: settled (free league).`,
  };
}
