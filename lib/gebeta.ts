/**
 * Gebeta 1 vs 1: shared types and small helpers (browser + server).
 * The rules live in the database (supabase/migrations/0058_gebeta_1v1.sql); this file mirrors the board layout
 * for the screen and turns database errors into plain words.
 *
 * Board: 14 cells. 0-5 = player 1 (the creator) pits, 6 = player 1 store, 7-12 = player 2 pits, 13 = player 2 store.
 * The pit opposite cell i is cell 12 - i.
 */
export const GEBETA_STAKES_ETB = [200, 500, 1000, 2000, 5000] as const;
export const GEBETA_MOVE_SECONDS = 60;

export interface GebetaState {
  code: string;
  status: "open" | "live" | "settled" | "cancelled";
  stake_units: number;
  fee_pct: number;
  creator: string;
  opponent: string | null;
  /** 1 = creator, 2 = opponent, 0 = watching */
  my_seat: 0 | 1 | 2;
  turn: 1 | 2;
  board: number[];
  last_pit: number | null;
  moves: number;
  ms_left: number | null;
  expires_in_s: number;
  winner: string | null;
  result: "score" | "draw" | "timeout" | "resign" | null;
  i_won: boolean | null;
}

/** The cells as one player sees them: their pits (left to right), the pits opposite, and both stores. */
export function gebetaView(board: number[], seat: 0 | 1 | 2) {
  const base = seat === 2 ? 7 : 0;
  const oppBase = seat === 2 ? 0 : 7;
  const mine = [0, 1, 2, 3, 4, 5].map((i) => ({ cell: base + i, seeds: board[base + i] ?? 0 }));
  // directly above my pit i sits the pit opposite it (cell 12 - mine)
  const theirs = mine.map((m) => ({ cell: 12 - m.cell, seeds: board[12 - m.cell] ?? 0 }));
  return { mine, theirs, myStore: board[base + 6] ?? 0, theirStore: board[oppBase + 6] ?? 0, base };
}

export function gebetaError(m: string): string {
  if (m.includes("taking a break")) return m.replace(/^.*betting paused: /, "You are on a break: ") + ". You can still withdraw.";
  if (m.includes("insufficient")) return "Not enough Units in your wallet for this stake. Top up first.";
  if (m.includes("phone not verified")) return "Please confirm your phone number first (Profile).";
  if (m.includes("date of birth")) return "Add your date of birth on your Profile first (18+ only).";
  if (m.includes("already have an open game")) return "You already have an open game. Cancel it or wait for an opponent.";
  if (m.includes("already joined")) return "This is your own game: send the link to a friend.";
  if (m.includes("game not found")) return "Game not found. Check the code.";
  if (m.includes("closed")) return "This game is closed.";
  if (m.includes("not your turn")) return "Wait for your turn.";
  if (m.includes("pit is empty")) return "That pit is empty: pick another one.";
  if (m.includes("pick a pit")) return "Pick one of your six pits.";
  if (m.includes("not running")) return "This game is not running.";
  if (m.includes("not in this game")) return "You are not a player in this game.";
  if (m.includes("stake must")) return "The stake must be 200 to 10,000 ETB, in steps of 50 ETB.";
  if (m.includes("not signed in")) return "Please log in again.";
  return "Something went wrong. Please try again.";
}
