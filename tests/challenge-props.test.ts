import { test } from "node:test";
import assert from "node:assert/strict";
import { htOf, normalizeProps, propPoints, propsComplete, propsFromScore, propSummary } from "../lib/challenge-props";

const ft = (home: number | null, away: number | null) => ({ home, away });

test("both teams to score", () => {
  assert.equal(propPoints({ btts: true }, ft(2, 1), ft(null, null)), 1);
  assert.equal(propPoints({ btts: false }, ft(2, 1), ft(null, null)), 0);
  assert.equal(propPoints({ btts: false }, ft(3, 0), ft(null, null)), 1);
  assert.equal(propPoints({ btts: true }, ft(0, 0), ft(null, null)), 0);
});

test("over / under 2.5: 3 goals is Over, 2 is Under", () => {
  assert.equal(propPoints({ over25: true }, ft(2, 1), ft(null, null)), 1);
  assert.equal(propPoints({ over25: false }, ft(1, 1), ft(null, null)), 1);
  assert.equal(propPoints({ over25: true }, ft(2, 0), ft(null, null)), 0);
  assert.equal(propPoints({ over25: false }, ft(0, 3), ft(null, null)), 0);
});

test("half-time result", () => {
  assert.equal(htOf(1, 0), "H");
  assert.equal(htOf(0, 0), "D");
  assert.equal(htOf(0, 2), "A");
  assert.equal(propPoints({ ht: "D" }, ft(2, 1), ft(0, 0)), 1);
  assert.equal(propPoints({ ht: "H" }, ft(2, 1), ft(0, 0)), 0);
  assert.equal(propPoints({ ht: "A" }, ft(1, 2), ft(0, 1)), 1);
});

test("all three right = 3 extra points, all wrong = 0", () => {
  assert.equal(propPoints({ btts: true, over25: true, ht: "H" }, ft(2, 1), ft(1, 0)), 3);
  assert.equal(propPoints({ btts: false, over25: false, ht: "A" }, ft(2, 1), ft(1, 0)), 0);
});

test("missing half-time score voids only the half-time pick (0 for everyone)", () => {
  assert.equal(propPoints({ btts: true, over25: true, ht: "H" }, ft(2, 1), ft(null, null)), 2);
  assert.equal(propPoints({ ht: "D" }, ft(1, 1), ft(null, null)), 0);
});

test("no full-time score: only a known half-time score can count (called-off matches are zeroed by the settler)", () => {
  assert.equal(propPoints({ btts: true, over25: false, ht: "D" }, ft(null, null), ft(0, 0)), 1, "half-time still counts if known");
  assert.equal(propPoints({ btts: true, over25: false }, ft(null, null), ft(null, null)), 0);
});

test("unanswered picks score nothing", () => {
  assert.equal(propPoints({}, ft(2, 1), ft(1, 0)), 0);
  assert.equal(propPoints({ btts: null, over25: null, ht: null }, ft(2, 1), ft(1, 0)), 0);
});

test("starting answers follow the score pick", () => {
  assert.deepEqual(propsFromScore(2, 1), { btts: true, over25: true });
  assert.deepEqual(propsFromScore(1, 0), { btts: false, over25: false });
  assert.deepEqual(propsFromScore(0, 3), { btts: false, over25: true });
});

test("every switched-on extra pick must be answered", () => {
  assert.equal(propsComplete([], {}), true);
  assert.equal(propsComplete(["btts", "ht"], { btts: false, ht: "D" }), true);
  assert.equal(propsComplete(["btts", "ht"], { btts: false }), false);
  assert.equal(propsComplete(["ou25"], { over25: null }), false);
});

test("props list is cleaned and ordered", () => {
  assert.deepEqual(normalizeProps(["ht", "btts", "ht", "corners", 5]), ["btts", "ht"]);
  assert.deepEqual(normalizeProps(null), []);
});

test("summary text", () => {
  assert.equal(propSummary(["btts", "ou25", "ht"], { btts: true, over25: false, ht: "A" }, "Arsenal", "Chelsea"), "BTTS Yes · Under · HT Chelsea");
  assert.equal(propSummary(["ht"], { btts: true, ht: "D" }), "HT Draw");
});
