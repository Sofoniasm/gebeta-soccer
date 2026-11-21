import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMove, inCheck, legalTargets } from "../lib/chess-rules";
import { chessError, movePairs } from "../lib/chess";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

test("chess: legal and illegal moves are told apart on the server", () => {
  const e4 = checkMove(START, "e2", "e4");
  assert.ok(e4.ok);
  if (e4.ok) {
    assert.equal(e4.san, "e4");
    assert.equal(e4.outcome, null);
    assert.match(e4.newFen, / b KQkq - 0 1$/);
  }
  assert.equal(checkMove(START, "e2", "e5").ok, false); // a pawn cannot jump three squares
  assert.equal(checkMove(START, "e7", "e5").ok, false); // black's piece on white's turn
  assert.equal(checkMove(START, "a1", "a3").ok, false); // blocked by its own pawn
  assert.equal(checkMove(START, "z9", "e4").ok, false); // not a square
  assert.equal(checkMove(START, "e2", "e4", "x").ok, false); // not a promotion piece
});

test("chess: fool's mate is checkmate, stalemate is a draw", () => {
  let fen = START;
  let last = null as ReturnType<typeof checkMove> | null;
  for (const [f, t] of [["f2", "f3"], ["e7", "e5"], ["g2", "g4"], ["d8", "h4"]] as const) {
    last = checkMove(fen, f, t);
    assert.ok(last.ok);
    if (last.ok) fen = last.newFen;
  }
  assert.ok(last && last.ok && last.outcome === "checkmate");
  // black king h8, white king f7... the classic stalemate: white to play Qg6 stalemates black
  const stale = checkMove("7k/5K2/8/8/8/8/8/6Q1 w - - 0 1", "g1", "g6");
  assert.ok(stale.ok && stale.outcome === "draw");
});

test("chess: promotion, castling and en passant are understood", () => {
  const promo = checkMove("8/P6k/8/8/8/8/8/K7 w - - 0 1", "a7", "a8", "n");
  assert.ok(promo.ok && promo.san.startsWith("a8=N"));
  assert.ok(checkMove("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "e1", "g1").ok); // castling
  assert.ok(checkMove("8/8/8/3pP3/8/8/8/k6K w - d6 0 1", "e5", "d6").ok); // en passant
});

test("chess: legal squares for the screen and check detection", () => {
  assert.deepEqual(legalTargets(START, "g1").map((m) => m.to).sort(), ["f3", "h3"]);
  assert.equal(legalTargets("8/P6k/8/8/8/8/8/K7 w - - 0 1", "a7")[0].promotion, true);
  assert.equal(inCheck(START), false);
  assert.equal(inCheck("4k3/8/8/8/8/8/4r3/4K3 w - - 0 1"), true);
});

test("chess: move list and error words", () => {
  assert.deepEqual(movePairs(["e4", "e5", "Nf3"]), [
    { no: 1, white: "e4", black: "e5" },
    { no: 2, white: "Nf3", black: null },
  ]);
  assert.match(chessError("not your turn"), /Wait for your turn/);
  assert.match(chessError("illegal move"), /not allowed/);
  assert.match(chessError("boom"), /Something went wrong/);
});
