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
 *   1. Most total points (match points + Slam Points)
 *   2. Tie-breaks, in order: most correct results → most exact scores
 *      → most close picks → smallest total goals away
 *   3. Still tied: players share the prizes for the positions they
 *      occupy, split equally.
 *
 * Winning bar (optional, main pool): only entrants whose MATCH points are
 * strictly above `minMatchPoints` can win. If nobody clears it, nobody is
 * paid and the house keeps the whole pool.
 *
 * All money maths is done in hundredths of a unit (integers) and
 * rounded DOWN, so payouts can never exceed the prize fund. Any
 * leftover hundredths stay with the house.
 */

import { calculateMatchPoints, goalsAway, gradePick, slamPoints } from "./scoring";
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
  /** Winning bar: match points must be strictly greater than this to win. */
  minMatchPoints?: number;
}

export interface Standing {
  userId: string;
  rank: number; // 1 = first; tied players share a rank
  totalPoints: number; // match points + slam points
  matchPoints: number;
  slamPoints: number;
  correctResults: number;
  exactScores: number;
  closePicks: number;
  goalsAway: number; // tie-break: lower is better
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
  /** Slam Points per player (only players who earned some). */
  slams: { userId: string; slamPoints: number }[];
  /** The bar used (null = no bar). */
  winningBar: number | null;
  /** Did at least one entrant clear the bar? (true when there is no bar) */
  barMet: boolean;
  /** Best match points of any entrant (Slam not included). */
  topMatchPoints: number;
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
  type Tally = { points: number; correct: number; exact: number; close: number; away: number };
  const totals = new Map<string, Tally>();
  for (const id of entrants) totals.set(id, { points: 0, correct: 0, exact: 0, close: 0, away: 0 });

  const pointsByPrediction: SettlementResult["pointsByPrediction"] = [];

  for (const p of input.predictions) {
    if (!entrants.has(p.userId)) continue; // ignore non-entrants defensively
    const r = resultByMatch.get(p.matchId);
    if (!r) {
      // Postponed / cancelled: 0 for everyone, doesn't count toward slams.
      pointsByPrediction.push({ predictionId: p.predictionId, points: 0 });
      continue;
    }
    const grade = gradePick(p.predictedHome, p.predictedAway, r.homeScore, r.awayScore);
    const points = calculateMatchPoints(p.predictedHome, p.predictedAway, r.homeScore, r.awayScore);
    pointsByPrediction.push({ predictionId: p.predictionId, points });

    const t = totals.get(p.userId)!;
    t.points += points;
    if (grade !== "wrong") t.correct += 1;
    if (grade === "exact") t.exact += 1;
    if (grade === "close") t.close += 1;
    t.away += goalsAway(p.predictedHome, p.predictedAway, r.homeScore, r.awayScore);
  }

  // Missing picks count as maximally far for the closeness tie-break.
  for (const [userId, t] of totals) {
    const picked = new Set(input.predictions.filter((p) => p.userId === userId).map((p) => p.matchId));
    for (const r of input.results) if (!picked.has(r.matchId)) t.away += 20;
  }

  // ---- 2. Rank ---------------------------------------------------------
  const sorted = [...totals.entries()]
    .map(([userId, t]) => {
      const slam = slamPoints(t.correct);
      return {
        userId,
        totalPoints: t.points + slam,
        matchPoints: t.points,
        slamPoints: slam,
        correctResults: t.correct,
        exactScores: t.exact,
        closePicks: t.close,
        goalsAway: t.away,
      };
    })
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.correctResults - a.correctResults ||
        b.exactScores - a.exactScores ||
        b.closePicks - a.closePicks ||
        a.goalsAway - b.goalsAway ||
        a.userId.localeCompare(b.userId) // stable order only; not a tie-break
    );

  const sameRank = (a: (typeof sorted)[number], b: (typeof sorted)[number]) =>
    a.totalPoints === b.totalPoints &&
    a.correctResults === b.correctResults &&
    a.exactScores === b.exactScores &&
    a.closePicks === b.closePicks &&
    a.goalsAway === b.goalsAway;

  // Group players who are still level after every tie-break.
  const groups: (typeof sorted)[] = [];
  for (const st of sorted) {
    const last = groups[groups.length - 1];
    if (last && sameRank(last[0], st)) last.push(st);
    else groups.push([st]);
  }

  // ---- 3. Money -------------------------------------------------------
  const poolCents = toCents(entrants.size * input.entryFeeUnits);
  const prizeFundCents = Math.floor(poolCents * (1 - houseCut));

  const standings: Standing[] = [];
  const payouts: Payout[] = [];
  let paidCents = 0;
  let position = 0; // 0-based finishing position of the group's first player
  let prizePosition = 0; // positions among entrants who cleared the winning bar
  const bar = input.minMatchPoints ?? null;
  // A group shares totals and correct results, so it shares match points too.
  const clears = (g: (typeof sorted)[number][]) => bar === null || g[0].matchPoints > bar + 1e-9;

  for (const group of groups) {
    // Prize % for the positions this group occupies, shared equally.
    // Below the winning bar a group is ranked but never paid.
    const share = clears(group)
      ? prizeSplit.slice(prizePosition, prizePosition + group.length).reduce((a, b) => a + b, 0)
      : 0;
    if (clears(group)) prizePosition += group.length;
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
    slams: sorted.filter((x) => x.slamPoints > 0).map((x) => ({ userId: x.userId, slamPoints: x.slamPoints })),
    winningBar: bar,
    barMet: bar === null || sorted.some((x) => x.matchPoints > bar + 1e-9),
    topMatchPoints: sorted.reduce((m, x) => Math.max(m, x.matchPoints), 0),
  };
}
