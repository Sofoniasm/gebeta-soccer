/**
 * GebetaSoccer scoring rules (Superbru-style)
 * ---------------------------------------------------------------
 * Per match:
 *   3   Exact score                                   (pick 2-1, ends 2-1)
 *   1.5 Close: right result AND
 *         - only one goal away in total, or           (pick 2-0, ends 3-0)
 *         - two goals away with the same goal         (pick 1-1, ends 2-2;
 *           difference (both scores shifted by one)     pick 2-1, ends 3-2)
 *   1   Right result, not close                        (pick 4-0, ends 1-0)
 *   0   Wrong result                                   (pick 1-0, ends 0-2)
 *
 * Per round — Slam Points for correct results (any of the above > 0):
 *   5–7 correct → +1   ·   8–9 correct → +2   ·   10+ correct → +3
 *
 * "Result" = home win / draw / away win. Pure functions, easy to test.
 */

export const POINTS = {
  EXACT: 3,
  CLOSE: 1.5,
  RESULT: 1,
  WRONG: 0,
} as const;

export type Outcome = "HOME" | "DRAW" | "AWAY";
export type PickGrade = "exact" | "close" | "result" | "wrong";

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

/** Total goals between a pick and the real score, e.g. 2-1 vs 3-2 → 2. */
export function goalsAway(ph: number, pa: number, ah: number, aa: number): number {
  return Math.abs(ph - ah) + Math.abs(pa - aa);
}

/** Classify one prediction against a finished match. */
export function gradePick(ph: number, pa: number, ah: number, aa: number): PickGrade {
  assertValidScore(ph, "predictedHome");
  assertValidScore(pa, "predictedAway");
  assertValidScore(ah, "actualHome");
  assertValidScore(aa, "actualAway");

  if (ph === ah && pa === aa) return "exact";
  if (outcomeOf(ph, pa) !== outcomeOf(ah, aa)) return "wrong";

  const away = goalsAway(ph, pa, ah, aa);
  const sameGoalDifference = ph - pa === ah - aa;
  if (away === 1 || (away === 2 && sameGoalDifference)) return "close";
  return "result";
}

/** Points one prediction earns for one finished match. */
export function calculateMatchPoints(ph: number, pa: number, ah: number, aa: number): number {
  const g = gradePick(ph, pa, ah, aa);
  return g === "exact" ? POINTS.EXACT : g === "close" ? POINTS.CLOSE : g === "result" ? POINTS.RESULT : POINTS.WRONG;
}

export function isExactScore(ph: number, pa: number, ah: number, aa: number): boolean {
  return ph === ah && pa === aa;
}

/** Slam Points for the number of correct results in a round. */
export function slamPoints(correctResults: number): number {
  if (correctResults >= 10) return 3;
  if (correctResults >= 8) return 2;
  if (correctResults >= 5) return 1;
  return 0;
}
