/**
 * Survivor pools: shared types and small helpers (browser + server).
 * The rules live in the database (supabase/migrations/0057_survivor_pools.sql); this file mirrors the numbers
 * for the screen and turns database errors into plain words.
 */
export const SURVIVOR_STAKES_ETB = [200, 500, 1000, 2000, 5000] as const;
export const SURVIVOR_MIN_PLAYERS = [3, 4, 5, 6, 8, 10] as const;
export const SURVIVOR_DAYS = [3, 5, 7, 10] as const;

export interface SurvivorMatch {
  id: number;
  competition: string | null;
  home: string;
  away: string;
  kickoff_ms: number;
  status: string;
  home_score: number | null;
  away_score: number | null;
}
export interface SurvivorPlayer {
  username: string;
  alive: boolean;
  out_day: string | null;
  out_reason: string | null;
  payout: number | null;
  is_me: boolean;
  is_creator: boolean;
  picked: boolean;
  pick_team: string | null;
}
export interface SurvivorHistoryDay {
  day: string;
  picks: { username: string; team: string; result: "won" | "lost" | "void" | null }[];
}
export interface SurvivorState {
  code: string;
  status: "open" | "live" | "settled" | "refunded" | "cancelled";
  stake_units: number;
  min_players: number;
  max_players: number;
  max_days: number;
  days_played: number;
  fee_pct: number;
  creator: string;
  is_creator: boolean;
  is_member: boolean;
  expires_in_s: number;
  alive_count: number;
  current_day: string | null;
  waiting_next_day: boolean;
  lock_ms: number | null;
  now_ms: number;
  locked: boolean;
  matches: SurvivorMatch[];
  my_pick: { match_id: number; side: "home" | "away"; team: string } | null;
  used_teams: string[];
  players: SurvivorPlayer[];
  history: SurvivorHistoryDay[];
}

export function survivorError(m: string): string {
  if (m.includes("taking a break")) return m.replace(/^.*betting paused: /, "You are on a break: ") + ". You can still withdraw.";
  if (m.includes("insufficient")) return "Not enough Units in your wallet for this stake. Top up first.";
  if (m.includes("phone not verified")) return "Please confirm your phone number first (Profile).";
  if (m.includes("date of birth")) return "Add your date of birth on your Profile first (18+ only).";
  if (m.includes("already joined")) return "You are already in this pool.";
  if (m.includes("already have an open pool")) return "You already have an open pool. Start it or cancel it first.";
  if (m.includes("is full")) return "This pool is full.";
  if (m.includes("need at least")) return m.replace(/^.*need at least/, "You need at least").replace(/ players.*/, " players to start.");
  if (m.includes("no match day")) return "No match day is available yet (we need a day with at least 4 matches). Try again later.";
  if (m.includes("pool not found")) return "Pool not found. Check the code.";
  if (m.includes("closed")) return "This pool is closed.";
  if (m.includes("not alive")) return "You are out of this pool.";
  if (m.includes("already used")) return m.replace(/^.*you already used/, "You already used").replace(/ in this pool.*/, " in this pool: pick another team.");
  if (m.includes("not part of this day")) return "That match is not part of this match day.";
  if (m.includes("not picking")) return "This pool is not taking picks right now.";
  if (m.includes("stake must")) return "The stake must be 200 to 10,000 ETB, in steps of 50 ETB.";
  if (m.includes("not signed in")) return "Please log in again.";
  return "Something went wrong. Please try again.";
}

/** Plain-words label of a pool status. */
export function survivorStatusLabel(status: string): string {
  return (
    { open: "Waiting for players", live: "Live", settled: "Finished", refunded: "Refunded", cancelled: "Cancelled" } as Record<string, string>
  )[status] ?? status;
}

/** "2026-11-22" → "Sun 22 Nov" (the date is already the Addis Ababa calendar day, so no time zone maths). */
export function survivorDayLabel(day: string): string {
  const [y, m, d] = day.split("-").map(Number);
  if (!y || !m || !d) return day;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}
