/**
 * Quiz Royale: shared types and small helpers (browser + server).
 * The rules live in the database (supabase/migrations/0056_quiz_royale.sql); this file only mirrors the numbers
 * for the screen and turns database errors into plain words.
 */
export const ROYALE_QUESTIONS = 10;
export const ROYALE_QUESTION_SECONDS = 15;
export const ROYALE_STAKES_ETB = [200, 500, 1000, 2000, 5000] as const;
export const ROYALE_MIN_PLAYERS = [3, 4, 5, 6] as const;

export interface RoyalePlayer {
  username: string;
  score: number;
  correct: number;
  rank: number | null;
  payout: number | null;
  is_me: boolean;
  is_creator: boolean;
}
export interface RoyaleQuestionView {
  index: number;
  text: string;
  options: string[];
  my_choice: number | null;
}
export interface RoyaleReviewItem extends RoyaleQuestionView {
  correct: number;
  points: number | null;
}
export type RoyalePhase = "lobby" | "countdown" | "question" | "reveal" | "finishing" | "finished" | "cancelled";
export interface RoyaleState {
  code: string;
  status: "open" | "live" | "settled" | "refunded" | "cancelled";
  phase: RoyalePhase;
  /** Milliseconds left in the current phase, as the server saw it when it answered. */
  ms_left: number;
  stake_units: number;
  min_players: number;
  max_players: number;
  fee_pct: number;
  creator: string;
  is_creator: boolean;
  is_member: boolean;
  expires_in_s: number;
  players: RoyalePlayer[];
  question: RoyaleQuestionView | null;
  reveal: { index: number; correct: number } | null;
  review: RoyaleReviewItem[] | null;
}

/** Points for a right answer after `elapsedMs`: 100, plus up to 100 for speed (mirror of royale_answer in SQL). */
export function royalePoints(correct: boolean, elapsedMs: number): number {
  if (!correct) return 0;
  const ms = Math.min(Math.max(elapsedMs, 0), ROYALE_QUESTION_SECONDS * 1000);
  return 100 + Math.round((100 * (ROYALE_QUESTION_SECONDS * 1000 - ms)) / (ROYALE_QUESTION_SECONDS * 1000));
}

export function royaleError(m: string): string {
  if (m.includes("taking a break")) return m.replace(/^.*betting paused: /, "You are on a break: ") + ". You can still withdraw.";
  if (m.includes("insufficient")) return "Not enough Units in your wallet for this stake. Top up first.";
  if (m.includes("phone not verified")) return "Please confirm your phone number first (Profile).";
  if (m.includes("date of birth")) return "Add your date of birth on your Profile first (18+ only).";
  if (m.includes("already joined")) return "You are already in this room.";
  if (m.includes("already have an open room")) return "You already have an open room. Start it or leave it first.";
  if (m.includes("is full")) return "This room is full.";
  if (m.includes("need at least")) return m.replace(/^.*need at least/, "You need at least").replace(/ players.*/, " players to start.");
  if (m.includes("not enough questions")) return "The question bank is being refreshed. Please try again later.";
  if (m.includes("room not found")) return "Room not found. Check the code.";
  if (m.includes("closed")) return "This room is closed.";
  if (m.includes("time is up")) return "Too late: that question is closed.";
  if (m.includes("not open")) return "That question is not open.";
  if (m.includes("already answered")) return "You already answered this question.";
  if (m.includes("not running")) return "This game is not running.";
  if (m.includes("stake must")) return "The stake must be 200 to 10,000 ETB, in steps of 50 ETB.";
  if (m.includes("not signed in")) return "Please log in again.";
  return "Something went wrong. Please try again.";
}

/** A question as the AI writes it (checked before it goes into the bank). */
export interface RoyaleDraft {
  topic: string;
  question: string;
  options: string[];
  correct: number;
}

/** null when fine, otherwise what is wrong. */
export function validateRoyaleDraft(q: RoyaleDraft): string | null {
  if (q.question.length < 8 || q.question.length > 300) return "the question must be 8 to 300 characters";
  if (q.options.length !== 4) return "there must be exactly 4 options";
  if (q.options.some((o) => o.length < 1 || o.length > 80)) return "every option must be 1 to 80 characters";
  if (new Set(q.options.map((o) => o.toLowerCase())).size !== 4) return "the 4 options must be different";
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return "the right answer must be 0 to 3";
  return null;
}

/** AI tends to put the right answer first: move it to a random place (rnd is injectable for tests). */
export function shuffleDraft(q: RoyaleDraft, rnd: () => number = Math.random): RoyaleDraft {
  const order = [0, 1, 2, 3].sort(() => rnd() - 0.5);
  return { ...q, options: order.map((i) => q.options[i]), correct: order.indexOf(q.correct) };
}
