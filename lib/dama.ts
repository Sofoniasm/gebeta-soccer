/**
 * Dama 1 vs 1: shared types and small helpers (browser + server).
 * The rules live in the database (supabase/migrations/0059_dama_1v1.sql); this file only lays the board out
 * for the screen and turns database errors into plain words.
 *
 * Cells 0-63 (cell = row * 8 + column). 0 empty, 1 = player 1 man, 2 = player 1 king, 3 = player 2 man, 4 = player 2 king.
 */
export const DAMA_STAKES_ETB = [200, 500, 1000, 2000, 5000] as const;
export const DAMA_MOVE_SECONDS = 60;

export interface DamaState {
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
  chain_from: number | null;
  last_from: number | null;
  last_to: number | null;
  moves: number;
  /** [from, to] pairs the player on turn may play (only sent to that player) */
  legal: [number, number][];
  ms_left: number | null;
  expires_in_s: number;
  winner: string | null;
  result: "score" | "draw" | "timeout" | "resign" | null;
  i_won: boolean | null;
}

/**
 * The cell shown at screen row `dr` (0 = top) and column `dc`. Each player sees their own men at the bottom,
 * moving up the screen: player 1 sees the board as it is, player 2 sees it turned round.
 */
export function damaCell(seat: 0 | 1 | 2, dr: number, dc: number): number {
  return seat === 2 ? dr * 8 + (7 - dc) : (7 - dr) * 8 + dc;
}

export function damaOwner(v: number): 0 | 1 | 2 {
  return v === 1 || v === 2 ? 1 : v === 3 || v === 4 ? 2 : 0;
}

export function damaCounts(board: number[]) {
  return { p1: board.filter((v) => v === 1 || v === 2).length, p2: board.filter((v) => v === 3 || v === 4).length };
}

export function damaError(m: string): string {
  if (m.includes("taking a break")) return m.replace(/^.*betting paused: /, "You are on a break: ") + ". You can still withdraw.";
  if (m.includes("insufficient")) return "Not enough Units in your wallet for this stake. Top up first.";
  if (m.includes("phone not verified")) return "Please confirm your phone number first (Profile).";
  if (m.includes("date of birth")) return "Add your date of birth on your Profile first (18+ only).";
  if (m.includes("already have an open game")) return "You already have an open game. Cancel it or wait for an opponent.";
  if (m.includes("already joined")) return "This is your own game: send the link to a friend.";
  if (m.includes("game not found")) return "Game not found. Check the code.";
  if (m.includes("closed")) return "This game is closed.";
  if (m.includes("not your turn")) return "Wait for your turn.";
  if (m.includes("illegal move")) return "That move is not allowed. If you can capture, you must.";
  if (m.includes("not running")) return "This game is not running.";
  if (m.includes("not in this game")) return "You are not a player in this game.";
  if (m.includes("stake must")) return "The stake must be 200 to 10,000 ETB, in steps of 50 ETB.";
  if (m.includes("not signed in")) return "Please log in again.";
  return "Something went wrong. Please try again.";
}
