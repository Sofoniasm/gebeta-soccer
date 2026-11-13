/**
 * "Never win your own money" rules (client + server, pure, easy to test).
 *
 *  - A challenge, league or round that settles with only ONE distinct player
 *    (one user, even with several slips) is a solo refund: every stake goes
 *    back in full, no house fee, no winner.
 *  - What a player sees as their prize never counts their own stake as money
 *    won from others: "You can win X: your Y back + Z from other players".
 */
import { etbLabel } from "@/lib/money";

export const SOLO_REFUND_MESSAGE = "Nobody else joined, so your stake was refunded in full.";
export const SOLO_REFUND_MESSAGE_AM = "ሌላ ተጫዋች ስላልተቀላቀለ ያስያዙት ገንዘብ ሙሉ በሙሉ ተመልሷል።";
export const WAITING_MESSAGE = "Waiting for players. Your stake comes back in full if nobody joins.";

/** Number of different players (a user with several slips counts once). */
export function distinctPlayers(userIds: readonly string[]): number {
  return new Set(userIds).size;
}

/** True when exactly one distinct player took part: refund, nobody wins. */
export function isSoloEntry(userIds: readonly string[]): boolean {
  return distinctPlayers(userIds) === 1;
}

export interface Stake {
  userId: string;
  units: number;
}

/**
 * Solo refund: every stake back in full, nothing for the house.
 * Stakes from the same user are added up (one line per user, in first-seen order).
 * Returns null when more than one player took part (normal settlement).
 */
export function soloRefunds(stakes: readonly Stake[]): Stake[] | null {
  if (!isSoloEntry(stakes.map((s) => s.userId))) return null;
  const cents = new Map<string, number>();
  for (const s of stakes) cents.set(s.userId, (cents.get(s.userId) ?? 0) + Math.round(s.units * 100));
  return [...cents].filter(([, c]) => c > 0).map(([userId, c]) => ({ userId, units: c / 100 }));
}

export type MyPrize =
  | { kind: "waiting" }
  | {
      kind: "prize";
      /** X: what the player gets if they win (pot after the house fee). */
      winUnits: number;
      /** Y: the player's own stake(s) in the pot. */
      ownUnits: number;
      /** Z = X − Y: money that came from other players (can be ≤ 0 with many own slips). */
      fromOthersUnits: number;
    };

/**
 * The prize as one player should see it.
 * @param prizeUnits   pot after the house fee (X)
 * @param myStakeUnits the player's own stakes in this pot (Y)
 * @param otherPlayers distinct OTHER players who are in
 */
export function myPrize(prizeUnits: number, myStakeUnits: number, otherPlayers: number): MyPrize {
  if (otherPlayers <= 0) return { kind: "waiting" };
  const x = Math.round(prizeUnits * 100);
  const y = Math.round(myStakeUnits * 100);
  return { kind: "prize", winUnits: x / 100, ownUnits: y / 100, fromOthersUnits: (x - y) / 100 };
}

/** The sentence shown under the prize. */
export function myPrizeText(p: MyPrize): string {
  if (p.kind === "waiting") return WAITING_MESSAGE;
  if (p.fromOthersUnits > 0) {
    return `You can win ${etbLabel(p.winUnits)}: your ${etbLabel(p.ownUnits)} back + ${etbLabel(p.fromOthersUnits)} from other players`;
  }
  // Several own slips against few others: the prize is not more than what you put in.
  return `You can win ${etbLabel(p.winUnits)} (you put in ${etbLabel(p.ownUnits)})`;
}

/** Players box: "N + you" for someone who is in, "N players" otherwise. */
export function playersLabel(totalPlayers: number, imIn: boolean): string {
  if (imIn) return `${Math.max(0, totalPlayers - 1)} + you`;
  return `${totalPlayers} player${totalPlayers === 1 ? "" : "s"}`;
}
