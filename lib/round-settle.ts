/**
 * Settle one main-pool round: score every slip, pay the winners (70%, winning
 * bar applies), tell everyone their result and settle the round's private
 * leagues. Used by the admin "Settle" button and by the automatic sync for
 * rounds marked "settle automatically". Server only.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { computeSlipSettlement } from "@/lib/slip-settle";
import { settleLeague } from "@/lib/league-settle";
import { formatUnits } from "@/lib/money";
import { buildRoundRecaps, type Lang } from "@/lib/round-recap";

export interface RoundSettleResult {
  ok: boolean;
  message: string;
}

/** True when every match is over (finished with a score, or called off). */
export function roundIsComplete(list: { status: string; actual_home_score: number | null; actual_away_score: number | null }[]): string | null {
  if (list.length === 0) return "This round has no matches.";
  const unfinished = list.filter((m) => !["finished", "cancelled", "postponed"].includes(m.status));
  if (unfinished.length > 0) return `${unfinished.length} match(es) not finished yet. Sync or enter scores first.`;
  const missing = list.filter((m) => m.status === "finished" && (m.actual_home_score === null || m.actual_away_score === null));
  if (missing.length > 0) return `${missing.length} finished match(es) have no score. Enter them first.`;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;
type Settle = Awaited<ReturnType<typeof computeSlipSettlement>>;

async function sendRoundRecaps(
  admin: Admin,
  roundName: string,
  result: Settle["result"],
  slips: Settle["slips"],
  slipById: Settle["slipById"],
  payouts: Settle["payouts"],
  picks: Settle["picks"],
  roundId: number,
) {
  if (result.standings.length === 0) return;
  const userIds = [...new Set(slips.map((s) => s.user_id))];
  const [{ data: matchData }, { data: profs }] = await Promise.all([
    admin.from("matches").select("id, home_team, away_team, actual_home_score, actual_away_score").eq("round_id", roundId),
    admin.from("profiles").select("id, telegram_user_id").in("id", userIds),
  ]);
  const chatOf = new Map(((profs ?? []) as { id: string; telegram_user_id: number | null }[]).filter((p) => p.telegram_user_id).map((p) => [p.id, Number(p.telegram_user_id)]));
  const { data: prefs } = chatOf.size
    ? await admin.from("telegram_prefs").select("chat_id, lang").in("chat_id", [...chatOf.values()])
    : { data: [] };
  const langByChat = new Map(((prefs ?? []) as { chat_id: number; lang: Lang }[]).map((p) => [Number(p.chat_id), p.lang]));
  const notes = buildRoundRecaps({
    roundName,
    standings: result.standings.map((s) => ({ slipId: s.userId, rank: s.rank, totalPoints: s.totalPoints, exactScores: s.exactScores, correctResults: s.correctResults })),
    slips: new Map([...slipById].map(([id, s]) => [id, { user_id: s.user_id, slip_no: s.slip_no }])),
    picks,
    pointsByPick: new Map(result.pointsByPrediction.map((p) => [p.predictionId, p.points])),
    matches: new Map(((matchData ?? []) as { id: number; home_team: string; away_team: string; actual_home_score: number | null; actual_away_score: number | null }[]).map((m) => [m.id, m])),
    payoutBySlip: new Map(payouts.map((p) => [String(p.slip.id), p.units])),
    langOf: (uid) => langByChat.get(chatOf.get(uid) ?? -1) ?? "en",
  });
  if (notes.length) await admin.from("notifications").insert(notes);
}

export async function settleRoundNow(roundId: number, adminId: string | null): Promise<RoundSettleResult> {
  const admin = createAdminClient();
  const { data: round } = await admin.from("rounds").select("*").eq("id", roundId).single();
  if (!round) return { ok: false, message: "Round not found." };
  if (!["open", "locked"].includes(round.status)) return { ok: false, message: `Round already ${round.status}.` };

  const { data: matches } = await admin.from("matches").select("status, actual_home_score, actual_away_score").eq("round_id", roundId);
  const problem = roundIsComplete((matches ?? []) as { status: string; actual_home_score: number | null; actual_away_score: number | null }[]);
  if (problem) return { ok: false, message: problem };

  // Every slip is an entrant (slips are always complete).
  const { result, slips, slipById, payouts, picks } = await computeSlipSettlement(admin, round);

  const { error } = await admin.rpc("settle_round_slips", {
    p_round_id: roundId,
    p_points: result.pointsByPrediction.map((p) => ({ pick_id: p.predictionId, points: p.points })),
    p_slams: result.slams.map((x) => ({ slip_id: Number(x.userId), slam_points: x.slamPoints })),
    p_payouts: payouts.map((p) => ({ slip_id: p.slip.id, units: p.units, rank: p.rank })),
    p_admin_id: adminId,
  });
  if (error) return { ok: false, message: error.message };

  // Personal recap for every player (one message each, in their bot language).
  const roundName = (round.name as string) || `Round ${roundId}`;
  try {
    await sendRoundRecaps(admin, roundName, result, slips, slipById, payouts, picks, roundId);
  } catch (e) {
    console.error("round recaps:", (e as Error).message); // never undo a settled round over a message
  }

  // Private leagues on this round are settled in the same step.
  const { data: openLeagues } = await admin.from("leagues").select("id").eq("round_id", roundId).eq("status", "open");
  const leagueMsgs: string[] = [];
  for (const l of (openLeagues ?? []) as { id: number }[]) {
    const r = await settleLeague(l.id, adminId);
    leagueMsgs.push(r.message);
  }

  const winners = payouts.length;
  const paid = payouts.reduce((sum, p) => sum + p.units, 0);
  return {
    ok: true,
    message:
      (result.barMet
        ? `${roundName} settled. Pool ${formatUnits(result.poolUnits)}, paid ${winners} winning slip${winners === 1 ? "" : "s"} ${formatUnits(paid)}, house ${formatUnits(result.houseUnits)}.`
        : `${roundName} settled with no winner (best slip ${result.topMatchPoints}, bar more than ${result.winningBar}). House keeps the pool: ${formatUnits(result.houseUnits)}.`) +
      (leagueMsgs.length ? ` Leagues: ${leagueMsgs.join(" ")}` : ""),
  };
}

/** Automatic sync: settle every open/locked round marked auto_settle whose matches are all over. */
export async function settleDueRounds(): Promise<string[]> {
  const admin = createAdminClient();
  const { data: rounds } = await admin.from("rounds").select("id").in("status", ["open", "locked"]).eq("auto_settle", true);
  const out: string[] = [];
  for (const r of (rounds ?? []) as { id: number }[]) {
    const { data: matches } = await admin.from("matches").select("status, actual_home_score, actual_away_score").eq("round_id", r.id);
    if (roundIsComplete((matches ?? []) as { status: string; actual_home_score: number | null; actual_away_score: number | null }[])) continue;
    const res = await settleRoundNow(r.id, null);
    out.push(res.message);
  }
  return out;
}
