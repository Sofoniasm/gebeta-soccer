/**
 * Round settlement — works out points, standings and payouts.
 * ---------------------------------------------------------------
 * Pure function: give it the round's data, it returns the numbers.
 * Writing them to the database is done by the `settle_round` SQL
 * function so everything is saved in a single transaction.
 *
 * Money rules
 *   pool        = entrants × entry fee (in units; 1 unit = 200 ETB)
 *   prize fund  = pool × (1 − houseCut)          (houseCut default 30%)
 *   payout      = prize fund × winning percentage for that position
 *
 * Ranking
 *   1. Most total points
 *   2. Tie-break: most exact scores
 *   3. Still tied: players share the prizes for the positions they
 *      occupy, split equally.
 *
 * All money maths is done in hundredths of a unit (integers) and
 * rounded DOWN, so payouts can never exceed the prize fund. Any
 * leftover hundredths stay with the house.
 */

import { calculateMatchPoints, isExactScore } from "./scoring";
import { DEFAULT_HOUSE_CUT } from "./money";

export interface PredictionInput {
  predictionId: number;
  userId: string;
  matchId: number;
  predictedHome: number;
  predictedAway: number;
}

/** A finished match. Matches that were postponed/cancelled are left out. */
export interface MatchResult {
  matchId: number;
  homeScore: number;
  awayScore: number;
}

export interface SettlementInput {
  /** Every user who paid the entry fee (even if they predicted nothing). */
  entrantIds: string[];
  predictions: PredictionInput[];
  results: MatchResult[];
  entryFeeUnits: number;
  /** Fraction kept by the house, e.g. 0.3 for 30%. */
  houseCut?: number;
  /**
   * Winning percentage per finishing position, must add up to ≤ 1.
   * [1] = winner takes all (default). [0.6, 0.3, 0.1] = top 3 paid.
   */
  prizeSplit?: number[];
}

export interface Standing {
  userId: string;
  rank: number; // 1 = first; tied players share a rank
  totalPoints: number;
  exactScores: number;
}

export interface Payout {
  userId: string;
  units: number;
}

export interface SettlementResult {
  poolUnits: number;
  prizeFundUnits: number;
  houseUnits: number; // house cut + rounding leftovers
  standings: Standing[];
  payouts: Payout[];
  /** Points for every prediction, ready for settle_round(). */
  pointsByPrediction: { predictionId: number; points: number }[];
}

const toCents = (units: number) => Math.round(units * 100);
const fromCents = (cents: number) => cents / 100;

export function settleRound(input: SettlementInput): SettlementResult {
  const houseCut = input.houseCut ?? DEFAULT_HOUSE_CUT;
  const prizeSplit = input.prizeSplit ?? [1];

  if (houseCut < 0 || houseCut >= 1) throw new RangeError("houseCut must be in [0, 1)");
  if (prizeSplit.some((p) => p < 0)) throw new RangeError("prizeSplit values must be ≥ 0");
  const splitTotal = prizeSplit.reduce((a, b) => a + b, 0);
  if (splitTotal > 1 + 1e-9) throw new RangeError("prizeSplit must add up to ≤ 1");

  const entrants = new Set(input.entrantIds);
  const resultByMatch = new Map(input.results.map((r) => [r.matchId, r]));

  // ---- 1. Score every prediction ------------------------------------
  const totals = new Map<string, { points: number; exact: number }>();
  for (const id of entrants) totals.set(id, { points: 0, exact: 0 });

  const pointsByPrediction: SettlementResult["pointsByPrediction"] = [];

  for (const p of input.predictions) {
    if (!entrants.has(p.userId)) continue; // ignore non-entrants defensively
    const r = resultByMatch.get(p.matchId);
    // Postponed / cancelled matches score 0 for everyone.
    const points = r
      ? calculateMatchPoints(p.predictedHome, p.predictedAway, r.homeScore, r.awayScore)
      : 0;
    const exact = r
      ? isExactScore(p.predictedHome, p.predictedAway, r.homeScore, r.awayScore)
      : false;

    pointsByPrediction.push({ predictionId: p.predictionId, points });
    const t = totals.get(p.userId)!;
    t.points += points;
    if (exact) t.exact += 1;
  }

  // ---- 2. Rank: points desc, then exact scores desc -------------------
  const sorted = [...totals.entries()]
    .map(([userId, t]) => ({ userId, totalPoints: t.points, exactScores: t.exact }))
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.exactScores - a.exactScores ||
        a.userId.localeCompare(b.userId) // stable order only; not a tie-break
    );

  // Group players who are still level after the tie-break.
  const groups: (typeof sorted)[] = [];
  for (const s of sorted) {
    const last = groups[groups.length - 1];
    if (
      last &&
      last[0].totalPoints === s.totalPoints &&
      last[0].exactScores === s.exactScores
    ) {
      last.push(s);
    } else {
      groups.push([s]);
    }
  }

  // ---- 3. Money -------------------------------------------------------
  const poolCents = toCents(entrants.size * input.entryFeeUnits);
  const prizeFundCents = Math.floor(poolCents * (1 - houseCut));

  const standings: Standing[] = [];
  const payouts: Payout[] = [];
  let paidCents = 0;
  let position = 0; // 0-based finishing position of the group's first player

  for (const group of groups) {
    // Prize % for the positions this group occupies, shared equally.
    const share = prizeSplit
      .slice(position, position + group.length)
      .reduce((a, b) => a + b, 0);
    // + 1e-6 absorbs float error (0.6 + 0.3 + 0.1 = 0.9999999999999999)
    const groupCents = Math.floor(prizeFundCents * share + 1e-6);
    const eachCents = Math.floor(groupCents / group.length);

    for (const s of group) {
      standings.push({ ...s, rank: position + 1 });
      if (eachCents > 0) {
        payouts.push({ userId: s.userId, units: fromCents(eachCents) });
        paidCents += eachCents;
      }
    }
    position += group.length;
  }

  return {
    poolUnits: fromCents(poolCents),
    prizeFundUnits: fromCents(prizeFundCents),
    houseUnits: fromCents(poolCents - paidCents),
    standings,
    payouts,
    pointsByPrediction,
  };
}
