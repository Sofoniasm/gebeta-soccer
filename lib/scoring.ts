/**
 * GebetaSoccer scoring rules
 * ---------------------------------------------------------------
 *   3   points  Exact score                         (pred 2-1, real 2-1)
 *   1.5 points  Correct result AND "close":
 *                 - same goal difference            (pred 3-1, real 2-0)
 *                 - or only one goal away in total  (pred 2-0, real 3-0)
 *   1   point   Correct result, not close           (pred 4-0, real 1-0)
 *   0   points  Wrong result                        (pred 1-0, real 0-2)
 *
 * "Result" means home win / draw / away win.
 * Pure function: no database, no side effects — easy to test.
 */

export const POINTS = {
  EXACT: 3,
  CLOSE: 1.5,
  RESULT: 1,
  WRONG: 0,
} as const;

export type Outcome = "HOME" | "DRAW" | "AWAY";

/** Home win, draw or away win for a scoreline. */
export function outcomeOf(home: number, away: number): Outcome {
  if (home > away) return "HOME";
  if (home < away) return "AWAY";
  return "DRAW";
}

function assertValidScore(n: number, label: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError(`${label} must be a whole number ≥ 0 (got ${n})`);
  }
}

/** Points a single prediction earns for a single finished match. */
export function calculateMatchPoints(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
): number {
  assertValidScore(predictedHome, "predictedHome");
  assertValidScore(predictedAway, "predictedAway");
  assertValidScore(actualHome, "actualHome");
  assertValidScore(actualAway, "actualAway");

  // 1. Exact score
  if (predictedHome === actualHome && predictedAway === actualAway) {
    return POINTS.EXACT;
  }

  // 2. Wrong result → nothing
  if (outcomeOf(predictedHome, predictedAway) !== outcomeOf(actualHome, actualAway)) {
    return POINTS.WRONG;
  }

  // 3. Right result — is it "close"?
  const sameGoalDifference =
    predictedHome - predictedAway === actualHome - actualAway;
  const goalsAway =
    Math.abs(predictedHome - actualHome) + Math.abs(predictedAway - actualAway);

  if (sameGoalDifference || goalsAway === 1) return POINTS.CLOSE;

  // 4. Right result, not close
  return POINTS.RESULT;
}

/** True when the prediction is an exact score (used for tie-breaks). */
export function isExactScore(
  predictedHome: number,
  predictedAway: number,
  actualHome: number,
  actualAway: number
): boolean {
  return predictedHome === actualHome && predictedAway === actualAway;
}
