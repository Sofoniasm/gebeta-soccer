import { test } from "node:test";
import assert from "node:assert/strict";
import { gebetaError, gebetaView } from "../lib/gebeta";

const board = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13, 14, 15, 16, 20];

test("gebeta view: each player sees their own pits at the bottom, the opposite pits above", () => {
  const p1 = gebetaView(board, 1);
  assert.deepEqual(p1.mine.map((p) => p.seeds), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(p1.theirs.map((p) => p.cell), [12, 11, 10, 9, 8, 7]);
  assert.equal(p1.myStore, 10);
  assert.equal(p1.theirStore, 20);
  const p2 = gebetaView(board, 2);
  assert.deepEqual(p2.mine.map((p) => p.cell), [7, 8, 9, 10, 11, 12]);
  assert.deepEqual(p2.theirs.map((p) => p.cell), [5, 4, 3, 2, 1, 0]);
  assert.equal(p2.myStore, 20);
  assert.equal(p2.theirStore, 10);
});

test("gebeta errors are plain words", () => {
  assert.match(gebetaError("insufficient balance"), /Not enough Units/);
  assert.match(gebetaError("not your turn"), /Wait for your turn/);
  assert.match(gebetaError("that pit is empty"), /empty/);
  assert.match(gebetaError("this game is closed"), /closed/);
  assert.match(gebetaError("boom"), /Something went wrong/);
});
