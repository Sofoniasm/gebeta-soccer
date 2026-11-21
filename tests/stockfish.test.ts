import { test } from "node:test";
import assert from "node:assert/strict";
import { bestMove, parseUci } from "../lib/stockfish";
import { checkMove } from "../lib/chess-rules";

test("stockfish: parses engine moves", () => {
  assert.deepEqual(parseUci("e2e4"), { from: "e2", to: "e4", promotion: undefined });
  assert.deepEqual(parseUci("e7e8q"), { from: "e7", to: "e8", promotion: "q" });
  assert.equal(parseUci("(none)"), null);
});

test("stockfish: the House Bot engine plays a legal move and finds a mate in one", { timeout: 30000 }, async () => {
  process.env.CHESS_BOT_MOVETIME_MS = "500";
  const start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const m = await bestMove(start);
  assert.ok(m, "the engine answered");
  const mv = parseUci(m!)!;
  assert.ok(checkMove(start, mv.from, mv.to, mv.promotion ?? "q").ok, "a legal move");
  // back-rank mate: Ra8#
  const mate = "6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1";
  const best = parseUci((await bestMove(mate))!)!;
  const chk = checkMove(mate, best.from, best.to, best.promotion ?? "q");
  assert.ok(chk.ok && chk.outcome === "checkmate", "finds the checkmate");
});

test("stockfish: starting the engine does not break the global fetch (the database client needs it)", { timeout: 30000 }, async () => {
  process.env.CHESS_BOT_MOVETIME_MS = "300";
  const before = typeof fetch;
  await bestMove("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
  assert.equal(before, "function");
  assert.equal(typeof fetch, "function");
});
