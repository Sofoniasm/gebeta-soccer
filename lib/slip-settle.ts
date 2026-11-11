/**
 * Settlement for multi-slip rounds (server only). Every SLIP is an entrant:
 * it pays one entry fee and competes on its own. Same scoring and tie-breaks
 * as before (lib/settlement.ts); winners' slips share 70% of the pool, but
 * only slips with MORE than half the match points can win. If none do,
 * the house keeps the whole pool.
 */
import { settleRound, type SettlementResult } from "@/lib/settlement";
import { winningBar } from "@/lib/scoring";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export interface SlipInfo {
  id: number;
  user_id: string;
  slip_no: number;
  username: string;
  phone: string | null;
  created_at: string;
}

export interface SlipSettlement {
  result: SettlementResult;
  slips: SlipInfo[];
  slipById: Map<string, SlipInfo>;
  payouts: { slip: SlipInfo; units: number; rank: number }[];
}

export async function computeSlipSettlement(admin: Admin, round: { id: number; entry_fee_units: number; house_cut: number }): Promise<SlipSettlement> {
  const [{ data: matchData }, { data: slipData }] = await Promise.all([
    admin.from("matches").select("id, status, actual_home_score, actual_away_score").eq("round_id", round.id),
    admin.from("slips").select("id, user_id, slip_no, created_at, profiles(username, phone_number)").eq("round_id", round.id).order("created_at"),
  ]);
  const matches = (matchData ?? []) as { id: number; status: string; actual_home_score: number | null; actual_away_score: number | null }[];
  const slips: SlipInfo[] = ((slipData ?? []) as {
    id: number;
    user_id: string;
    slip_no: number;
    created_at: string;
    profiles: { username: string; phone_number: string | null } | null;
  }[]).map((s) => ({
    id: s.id,
    user_id: s.user_id,
    slip_no: s.slip_no,
    created_at: s.created_at,
    username: s.profiles?.username ?? "player",
    phone: s.profiles?.phone_number ?? null,
  }));

  const { data: pickData } = slips.length
    ? await admin.from("slip_picks").select("id, slip_id, match_id, home, away").in("slip_id", slips.map((s) => s.id))
    : { data: [] };

  const results = matches
    .filter((m) => m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null)
    .map((m) => ({ matchId: m.id, homeScore: m.actual_home_score!, awayScore: m.actual_away_score! }));
  const result = settleRound({
    entrantIds: slips.map((s) => String(s.id)),
    entryFeeUnits: Number(round.entry_fee_units),
    houseCut: Number(round.house_cut),
    // Main pool rule: more than half the match points available to win.
    minMatchPoints: winningBar(results.length),
    results,
    predictions: ((pickData ?? []) as { id: number; slip_id: number; match_id: number; home: number; away: number }[]).map((p) => ({
      predictionId: p.id,
      userId: String(p.slip_id),
      matchId: p.match_id,
      predictedHome: p.home,
      predictedAway: p.away,
    })),
  });

  const slipById = new Map(slips.map((s) => [String(s.id), s]));
  const rankOf = new Map(result.standings.map((s) => [s.userId, s.rank]));
  const payouts = result.payouts
    .filter((p) => p.units > 0)
    .map((p) => ({ slip: slipById.get(p.userId)!, units: p.units, rank: rankOf.get(p.userId) ?? 1 }));
  return { result, slips, slipById, payouts };
}
