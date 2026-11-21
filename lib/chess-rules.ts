/**
 * Chess rules, checked on the SERVER with chess.js before a move is written to the database
 * (browser and server share this file; the browser only uses it to show the legal squares).
 */
import { Chess, type Square } from "chess.js";

export type ChessOutcome = "checkmate" | "draw" | null;
export type MoveCheck = { ok: true; newFen: string; san: string; outcome: ChessOutcome } | { ok: false };

/** Plays from -> to (queen unless told otherwise) on `fen`. Not ok when the move is not legal. */
export function checkMove(fen: string, from: string, to: string, promotion: string = "q"): MoveCheck {
  if (!/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to) || !/^[qrbn]$/.test(promotion)) return { ok: false };
  try {
    const g = new Chess(fen);
    const m = g.move({ from: from as Square, to: to as Square, promotion });
    if (!m) return { ok: false };
    const outcome: ChessOutcome = g.isCheckmate() ? "checkmate" : g.isDraw() ? "draw" : null;
    return { ok: true, newFen: g.fen(), san: m.san, outcome };
  } catch {
    return { ok: false };
  }
}

/** The squares the piece on `square` may move to, and whether the move is a promotion. */
export function legalTargets(fen: string, square: string): { to: string; promotion: boolean }[] {
  try {
    const g = new Chess(fen);
    return g.moves({ square: square as Square, verbose: true }).map((m) => ({ to: m.to, promotion: !!m.promotion }));
  } catch {
    return [];
  }
}

export function inCheck(fen: string): boolean {
  try {
    return new Chess(fen).inCheck();
  } catch {
    return false;
  }
}
