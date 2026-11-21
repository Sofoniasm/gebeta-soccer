/**
 * Chess 1 vs 1: shared types and small helpers (browser + server).
 * Money and the clock live in the database (supabase/migrations/0060_chess_1v1.sql); the rules are checked on the
 * server with chess.js (lib/chess-rules.ts).
 */
export const CHESS_STAKES_ETB = [200, 500, 1000, 2000, 5000] as const;
export const CHESS_MOVE_SECONDS = 120;

export interface ChessState {
  code: string;
  status: "open" | "live" | "settled" | "cancelled";
  stake_units: number;
  fee_pct: number;
  creator: string;
  opponent: string | null;
  /** 1 = creator, 2 = opponent, 0 = watching */
  my_seat: 0 | 1 | 2;
  /** "w" or "b" once the game has started (null for a watcher) */
  my_color: "w" | "b" | null;
  white: string | null;
  fen: string;
  /** whose turn it is: "w" or "b" */
  turn: "w" | "b";
  san_moves: string[];
  last_from: string | null;
  last_to: string | null;
  ms_left: number | null;
  expires_in_s: number;
  winner: string | null;
  result: "checkmate" | "draw" | "timeout" | "resign" | null;
  i_won: boolean | null;
  /** listed for other players, and the House Bot may join after the wait */
  open_to_all: boolean;
  /** the opponent is the House Bot (a computer) */
  vs_bot: boolean;
  bot_to_move: boolean;
  /** seconds until the House Bot may join this open game (null = it cannot) */
  bot_wait_s: number | null;
  bot_max_stake_units: number;
}

export const BOT_NAME = "House Bot";

export interface OpenChessGame {
  code: string;
  creator: string;
  stake_units: number;
  age_s: number;
}

export const PIECE_GLYPH: Record<string, string> = {
  k: "♚︎",
  q: "♛︎",
  r: "♜︎",
  b: "♝︎",
  n: "♞︎",
  p: "♟︎",
};

/** [1. e4 e5] style rows from a list of SAN moves. */
export function movePairs(san: string[]): { no: number; white: string; black: string | null }[] {
  const rows: { no: number; white: string; black: string | null }[] = [];
  for (let i = 0; i < san.length; i += 2) rows.push({ no: i / 2 + 1, white: san[i], black: san[i + 1] ?? null });
  return rows;
}

export function chessError(m: string): string {
  if (m.includes("taking a break")) return m.replace(/^.*betting paused: /, "You are on a break: ") + ". You can still withdraw.";
  if (m.includes("insufficient")) return "Not enough Units in your wallet for this stake. Top up first.";
  if (m.includes("phone not verified")) return "Please confirm your phone number first (Profile).";
  if (m.includes("date of birth")) return "Add your date of birth on your Profile first (18+ only).";
  if (m.includes("already have an open game")) return "You already have an open game. Cancel it or wait for an opponent.";
  if (m.includes("already joined")) return "This is your own game: send the link to a friend.";
  if (m.includes("game not found")) return "Game not found. Check the code.";
  if (m.includes("closed")) return "This game is closed.";
  if (m.includes("not your turn")) return "Wait for your turn.";
  if (m.includes("position changed")) return "The position changed. Look at the board and try again.";
  if (m.includes("illegal move")) return "That move is not allowed.";
  if (m.includes("not running")) return "This game is not running.";
  if (m.includes("not in this game")) return "You are not a player in this game.";
  if (m.includes("stake must")) return "The stake must be 200 to 10,000 ETB, in steps of 50 ETB.";
  if (m.includes("bot")) return "The House Bot is not available right now.";
  if (m.includes("not signed in")) return "Please log in again.";
  return "Something went wrong. Please try again.";
}
