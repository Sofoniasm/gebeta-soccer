/**
 * Round settlement — works out points, standings and payouts.
 * ---------------------------------------------------------------
 * Pure function: give it the round's data, it returns the numbers.
 * Writing them to the database is done by the `settle_round` SQL
 * function so everything is saved in a single transaction.
 *
 * Money rules (fair fee: the house only takes a share of what a winner
 * wins FROM OTHER PLAYERS, never of the winner's own stake)
 *   stake       = entry fee per entrant (in units; 1 unit = 200 ETB)
 *   winners     = everyone level in first place (they share)
 *   losers' pot = stakes of everyone else
 *   each winner = own stake back + losers' pot × (1 − houseCut) ÷ winners
 *   house       = losers' pot × houseCut + rounding leftovers
 *   Example: 2 players × 200 ETB, 30% cut → winner gets 200 + 140 = 340, house 60.
 *   Everyone level → nobody won anything from anybody: every stake back, house 0.
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

  if (houseCut < 0 || houseCut >= 1) throw new RangeError("houseCut must be in [0, 1)");

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
  const stakeCents = toCents(input.entryFeeUnits);
  const poolCents = stakeCents * entrants.size;
  const bar = input.minMatchPoints ?? null;
  // A group shares totals and correct results, so it shares match points too.
  const clears = (g: (typeof sorted)[number][]) => bar === null || g[0].matchPoints > bar + 1e-9;

  // Winners: the first-place group, if it clears the winning bar (if any).
  const winners = groups.length > 0 && clears(groups[0]) ? groups[0] : [];
  const { eachCents, prizeFundCents } = fairPrize(stakeCents, entrants.size, winners.length, houseCut);

  const standings: Standing[] = [];
  const payouts: Payout[] = [];
  let position = 0;
  for (const group of groups) {
    for (const s of group) standings.push({ ...s, rank: position + 1 });
    position += group.length;
  }
  let paidCents = 0;
  if (eachCents > 0) {
    for (const w of winners) {
      payouts.push({ userId: w.userId, units: fromCents(eachCents) });
      paidCents += eachCents;
    }
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

/**
 * Fair-fee prize, in cents. The house only takes `houseCut` of the losers' stakes.
 * Each winner gets their own stake back plus an equal share of the rest
 * (rounded DOWN to the cent; leftovers stay with the house).
 *   eachCents      what one winner is paid (0 when there is no winner)
 *   prizeFundCents what all winners are paid together
 * Mirror of the SQL in supabase/migrations/0049_fair_fee.sql.
 */
export function fairPrize(stakeCents: number, entrants: number, winners: number, houseCut: number): { eachCents: number; prizeFundCents: number } {
  if (winners <= 0 || entrants <= 0 || stakeCents <= 0) return { eachCents: 0, prizeFundCents: 0 };
  const w = Math.min(winners, entrants);
  const losersCents = stakeCents * (entrants - w);
  // + 1e-6 absorbs float error (e.g. 30000 × 0.7 = 20999.999999999996)
  const shareCents = Math.floor((losersCents * (1 - houseCut)) / w + 1e-6);
  const eachCents = stakeCents + shareCents;
  return { eachCents, prizeFundCents: eachCents * w };
}

/** What ONE winner would get if they won alone (for "prize" displays), in units. */
export function singleWinnerPrizeUnits(stakeUnits: number, entrants: number, houseCut: number): number {
  return fromCents(fairPrize(toCents(stakeUnits), entrants, 1, houseCut).eachCents);
}
