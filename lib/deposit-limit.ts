/**
 * Weekly deposit limit (responsible play, 0025): when does room come back?
 * Pure, so it can be tested. Mirrors the database:
 *  - deposits count for 7 days (rolling) from the moment they were made;
 *  - the limit in force is `limitUnits`, or `nextUnits` once `nextAt` has passed
 *    (a looser limit, or no limit = null, only applies after 7 days).
 */
export const WINDOW_MS = 7 * 86_400_000;

export interface LimitDeposit {
  units: number;
  at: string; // ISO time the deposit was made
}

export interface LimitInput {
  deposits: LimitDeposit[]; // deposits of the last 7 days (older ones are ignored anyway)
  limitUnits: number | null; // limit in force now (null = no limit)
  nextUnits?: number | null; // asked-for change: new limit (null = remove the limit)
  nextAt?: string | null; // when that change applies
  minUnits: number; // smallest deposit allowed (5 Units = 1,000 ETB)
  now?: Date;
}

export interface LimitOutlook {
  /** Room for a deposit right now, in Units (Infinity = no limit). */
  leftNow: number;
  /** First moment a deposit of at least `minUnits` fits again (null = it fits now). */
  nextDepositAt: Date | null;
  /** How much fits at `nextDepositAt` (Infinity = no limit by then). */
  leftAtNext: number | null;
  /** When the whole weekly amount is free again (null = it is free now or there is no limit). */
  fullRoomAt: Date | null;
}

const cents = (u: number) => Math.round(u * 100);

/** Room (Units) at instant t: limit in force at t minus deposits still inside their 7 days at t. */
function roomAt(t: number, input: LimitInput): number {
  const pendingApplies = input.nextAt != null && new Date(input.nextAt).getTime() <= t;
  const limit = pendingApplies ? (input.nextUnits ?? null) : input.limitUnits;
  if (limit === null) return Infinity;
  const used = input.deposits
    .filter((d) => {
      const at = new Date(d.at).getTime();
      return at <= t && at + WINDOW_MS > t;
    })
    .reduce((s, d) => s + cents(d.units), 0);
  return Math.max(0, cents(limit) - used) / 100;
}

export function limitOutlook(input: LimitInput): LimitOutlook {
  const now = (input.now ?? new Date()).getTime();
  const leftNow = roomAt(now, input);
  // Room only changes when a deposit turns 7 days old, or when an asked-for change applies.
  const moments = [
    ...input.deposits.map((d) => new Date(d.at).getTime() + WINDOW_MS),
    ...(input.nextAt ? [new Date(input.nextAt).getTime()] : []),
  ]
    .filter((t) => t > now)
    .sort((a, b) => a - b);

  let nextDepositAt: Date | null = null;
  let leftAtNext: number | null = null;
  if (leftNow < input.minUnits) {
    for (const t of moments) {
      const room = roomAt(t, input);
      if (room >= input.minUnits) {
        nextDepositAt = new Date(t);
        leftAtNext = room;
        break;
      }
    }
  }

  // The full weekly amount: the limit in force then, with no deposit still counting.
  let fullRoomAt: Date | null = null;
  const fullAt = (t: number) => {
    const pendingApplies = input.nextAt != null && new Date(input.nextAt).getTime() <= t;
    const limit = pendingApplies ? (input.nextUnits ?? null) : input.limitUnits;
    return limit === null || roomAt(t, input) >= limit;
  };
  if (!fullAt(now)) {
    for (const t of moments) {
      if (fullAt(t)) {
        fullRoomAt = new Date(t);
        break;
      }
    }
  }
  return { leftNow, nextDepositAt, leftAtNext, fullRoomAt };
}
