/** Private challenges: shared types and money helpers (client + server). */
import { ETB_PER_UNIT } from "@/lib/money";

/** GebetaSoccer keeps 10% of every challenge pot; the winner(s) share 90%. */
export const CHALLENGE_FEE = 0.1;
export const CHALLENGE_MIN_ETB = 200;
export const CHALLENGE_MAX_ETB = 1_000_000;
export const CHALLENGE_STEP_ETB = 50;
export const CHALLENGE_MAX_MATCHES = 10;

export const etbToUnits = (etb: number) => etb / ETB_PER_UNIT;

/** Prize for the winner when `players` people paid `stakeUnits` each (rounded down to 0.01 Unit). */
export function challengePrizeUnits(stakeUnits: number, players: number): number {
  return Math.floor(stakeUnits * players * (1 - CHALLENGE_FEE) * 100) / 100;
}

export function stakeError(etb: number): string | null {
  if (!Number.isFinite(etb) || etb < CHALLENGE_MIN_ETB) return `The stake must be at least ${CHALLENGE_MIN_ETB} ETB.`;
  if (etb > CHALLENGE_MAX_ETB) return "The stake can be at most 1,000,000 ETB.";
  if (etb % CHALLENGE_STEP_ETB !== 0) return `Use steps of ${CHALLENGE_STEP_ETB} ETB (e.g. 250, 1,000, 10,000).`;
  return null;
}

export interface ChallengeMatch {
  id: number;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  competition: string | null;
  kickoff_at: string;
  status: string;
  home_score: number | null;
  away_score: number | null;
}

export interface ChallengePick {
  match_id: number;
  home: number;
  away: number;
  points: number | null;
}

export interface ChallengeEntry {
  username: string;
  is_me: boolean;
  joined_at: string;
  points: number | null;
  rank: number | null;
  payout_units: number | null;
  picks: ChallengePick[] | null;
}

export interface Challenge {
  id: number;
  code: string;
  title: string;
  stake_units: number;
  max_players: number | null;
  fee_pct: number;
  status: "open" | "settled" | "refunded" | "cancelled";
  lock_at: string;
  prize_units: number | null;
  created_at: string;
  creator: string;
  is_creator: boolean;
  is_member: boolean;
  locked: boolean;
  players: number;
  matches: ChallengeMatch[];
  entries: ChallengeEntry[];
}

export interface MyChallenge {
  code: string;
  title: string;
  stake_units: number;
  status: Challenge["status"];
  lock_at: string;
  players: number;
  max_players: number | null;
  is_creator: boolean;
  my_rank: number | null;
  my_payout: number | null;
  matches: number;
}

/** Friendly words for database errors. */
export function challengeError(m: string): string {
  if (m.includes("insufficient")) return "Not enough Units in your wallet for this stake. Top up first: send the money to our Telegram admin.";
  if (m.includes("phone not verified")) return "Please confirm your phone number first (Profile).";
  if (m.includes("closed")) return "This challenge is closed: its first match has kicked off.";
  if (m.includes("already joined")) return "You are already in this challenge.";
  if (m.includes("full")) return "This challenge is full.";
  if (m.includes("every match")) return "Enter a score for every match.";
  if (m.includes("upcoming")) return "One of the matches has started or is no longer available. Pick again.";
  if (m.includes("stake")) return "The stake must be 200 to 1,000,000 ETB, in steps of 50 ETB.";
  if (m.includes("1 to 10")) return "Pick between 1 and 10 matches.";
  if (m.includes("name must")) return "Give the challenge a name (3 to 60 characters).";
  if (m.includes("can't be cancelled") || m.includes("can''t be cancelled")) return "Someone already joined, so it can't be cancelled.";
  if (m.includes("not found")) return "Challenge not found. Check the link or code.";
  return "Something went wrong. Please try again.";
}
