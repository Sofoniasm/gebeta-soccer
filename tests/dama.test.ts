import { test } from "node:test";
import assert from "node:assert/strict";
import { damaCell, damaCounts, damaError, damaOwner } from "../lib/dama";

test("dama board layout: each player sees their own side at the bottom", () => {
  assert.equal(damaCell(1, 7, 0), 0); // player 1: bottom-left is cell 0
  assert.equal(damaCell(1, 0, 7), 63);
  assert.equal(damaCell(2, 7, 0), 63); // player 2 sees the board turned round
  assert.equal(damaCell(2, 0, 7), 0);
  // every screen square maps to a different cell
  for (const seat of [1, 2] as const) {
    const cells = new Set<number>();
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) cells.add(damaCell(seat, r, c));
    assert.equal(cells.size, 64);
  }
});

test("dama pieces", () => {
  assert.equal(damaOwner(0), 0);
  assert.equal(damaOwner(2), 1);
  assert.equal(damaOwner(3), 2);
  assert.deepEqual(damaCounts([1, 2, 3, 4, 4, 0]), { p1: 2, p2: 3 });
});

test("dama errors are plain words", () => {
  assert.match(damaError("insufficient balance"), /Not enough Units/);
  assert.match(damaError("illegal move"), /you must/);
  assert.match(damaError("not your turn"), /Wait for your turn/);
  assert.match(damaError("boom"), /Something went wrong/);
});
