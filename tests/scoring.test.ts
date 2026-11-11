import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateMatchPoints as pts, gradePick, slamPoints } from "../lib/scoring";

test("exact score = 3", () => {
  assert.equal(pts(2, 1, 2, 1), 3);
  assert.equal(pts(0, 0, 0, 0), 3);
});

test("close = right result and 1 goal away = 1.5", () => {
  assert.equal(pts(2, 0, 3, 0), 1.5);
  assert.equal(pts(1, 0, 2, 0), 1.5);
});

test("close = right result, 2 goals away with the same goal difference = 1.5", () => {
  assert.equal(pts(1, 1, 2, 2), 1.5); // draw 1-1 v 2-2
  assert.equal(pts(3, 1, 2, 0), 1.5);
});

test("same goal difference but far away is only a result (no 1-0 for a 4-3)", () => {
  assert.equal(pts(1, 0, 4, 3), 1);
  assert.equal(pts(0, 0, 3, 3), 1);
});

test("right result otherwise = 1, wrong result = 0", () => {
  assert.equal(pts(4, 0, 1, 0), 1);
  assert.equal(pts(1, 0, 0, 2), 0);
  assert.equal(pts(0, 0, 1, 0), 0);
  assert.equal(gradePick(1, 0, 0, 1), "wrong");
});

test("Slam Points: 5-7 correct +1, 8-9 +2, 10 +3", () => {
  assert.deepEqual([0, 4, 5, 7, 8, 9, 10].map(slamPoints), [0, 0, 1, 1, 2, 2, 3]);
});

test("every scoreline 0-5 gives exactly one of 0 / 1 / 1.5 / 3", () => {
  for (let a = 0; a <= 5; a++)
    for (let b = 0; b <= 5; b++)
      for (let c = 0; c <= 5; c++)
        for (let d = 0; d <= 5; d++) assert.ok([0, 1, 1.5, 3].includes(pts(a, b, c, d)));
});
