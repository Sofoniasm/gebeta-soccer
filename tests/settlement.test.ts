import { test } from "node:test";
import assert from "node:assert/strict";
import { settleRound } from "../lib/settlement";

const pick = (id: number, user: string, match: number, h: number, a: number) => ({
  predictionId: id, userId: user, matchId: match, predictedHome: h, predictedAway: a,
});

test("70% to the winner, 30% house", () => {
  const r = settleRound({
    entrantIds: ["a", "b", "c", "d"],
    entryFeeUnits: 5,
    results: [{ matchId: 1, homeScore: 2, awayScore: 1 }],
    predictions: [pick(1, "a", 1, 2, 1), pick(2, "b", 1, 1, 0), pick(3, "c", 1, 0, 2)],
  });
  assert.equal(r.poolUnits, 20);
  assert.equal(r.prizeFundUnits, 14);
  assert.equal(r.houseUnits, 6);
  assert.deepEqual(r.payouts, [{ userId: "a", units: 14 }]);
});

test("players still tied after every tie-break share the prize", () => {
  const r = settleRound({
    entrantIds: ["a", "b", "c"],
    entryFeeUnits: 1,
    results: [{ matchId: 1, homeScore: 1, awayScore: 0 }],
    predictions: [pick(1, "a", 1, 1, 0), pick(2, "b", 1, 1, 0)],
  });
  assert.deepEqual(r.payouts, [{ userId: "a", units: 1.05 }, { userId: "b", units: 1.05 }]);
});

test("tie-break: same points → more correct results wins", () => {
  // a: exact (3) + wrong (0) = 3 ; b: result (1) + result (1) + ... make equal points with more correct
  const r = settleRound({
    entrantIds: ["a", "b"],
    entryFeeUnits: 1,
    results: [
      { matchId: 1, homeScore: 1, awayScore: 0 },
      { matchId: 2, homeScore: 0, awayScore: 2 },
      { matchId: 3, homeScore: 3, awayScore: 3 },
    ],
    predictions: [
      pick(1, "a", 1, 1, 0), pick(2, "a", 2, 2, 0), pick(3, "a", 3, 0, 1), // 3 + 0 + 0 = 3, 1 correct
      pick(4, "b", 1, 4, 0), pick(5, "b", 2, 0, 5), pick(6, "b", 3, 0, 0), // 1 + 1 + 1 = 3, 3 correct
    ],
  });
  assert.equal(r.standings[0].userId, "b");
  assert.deepEqual(r.payouts.map((p) => p.userId), ["b"]);
});

test("payouts never exceed the prize fund", () => {
  for (let n = 1; n <= 12; n++) {
    const ids = Array.from({ length: n }, (_, i) => `p${i}`);
    const r = settleRound({ entrantIds: ids, entryFeeUnits: 3, results: [], predictions: [] });
    const paid = r.payouts.reduce((s, p) => s + p.units, 0);
    assert.ok(paid <= r.prizeFundUnits + 1e-9, `n=${n}: paid ${paid} > ${r.prizeFundUnits}`);
  }
});

test("free league (fee 0) moves no money", () => {
  const r = settleRound({
    entrantIds: ["a", "b"],
    entryFeeUnits: 0,
    results: [{ matchId: 1, homeScore: 1, awayScore: 0 }],
    predictions: [pick(1, "a", 1, 1, 0)],
  });
  assert.equal(r.poolUnits, 0);
  assert.equal(r.payouts.reduce((s, p) => s + p.units, 0), 0);
});

test("predictions from non-entrants are ignored", () => {
  const r = settleRound({
    entrantIds: ["a"],
    entryFeeUnits: 1,
    results: [{ matchId: 1, homeScore: 1, awayScore: 0 }],
    predictions: [pick(1, "a", 1, 0, 1), pick(2, "intruder", 1, 1, 0)],
  });
  assert.ok(!r.payouts.some((p) => p.userId === "intruder"));
});

test("multi-slip: each slip is an entrant; one player's two winning slips share the prize", () => {
  // slips 1 and 2 belong to the same player, slip 3 to someone else
  const r = settleRound({
    entrantIds: ["1", "2", "3"],
    entryFeeUnits: 1,
    results: [{ matchId: 1, homeScore: 2, awayScore: 0 }],
    predictions: [pick(1, "1", 1, 2, 0), pick(2, "2", 1, 2, 0), pick(3, "3", 1, 0, 1)],
  });
  assert.equal(r.poolUnits, 3); // three slips paid
  assert.deepEqual(r.payouts, [{ userId: "1", units: 1.05 }, { userId: "2", units: 1.05 }]);
});

// ---- winning bar: more than half the match points (main pool) -----------
const tenMatches = Array.from({ length: 10 }, (_, i) => ({ matchId: i + 1, homeScore: 1, awayScore: 0 }));
// picks against 1-0: exact "1-0" = 3, close "2-0" = 1.5, result "3-0" = 1, wrong "0-1" = 0
const slip = (user: string, kinds: ("exact" | "close" | "result" | "wrong")[], start = 0) =>
  kinds.map((k, i) => {
    const [h, a] = k === "exact" ? [1, 0] : k === "close" ? [2, 0] : k === "result" ? [3, 0] : [0, 1];
    return pick(start + i + 1, user, i + 1, h, a);
  });

test("winning bar: exactly 15 of 30 is not enough, house keeps the whole pool", () => {
  const r = settleRound({
    entrantIds: ["a", "b"],
    entryFeeUnits: 1,
    minMatchPoints: 15,
    results: tenMatches,
    predictions: [
      ...slip("a", ["exact", "exact", "exact", "exact", "exact", "wrong", "wrong", "wrong", "wrong", "wrong"]),
      ...slip("b", Array(10).fill("wrong"), 100),
    ],
  });
  assert.equal(r.standings[0].userId, "a");
  assert.equal(r.standings[0].matchPoints, 15);
  assert.equal(r.standings[0].totalPoints, 16); // +1 Slam, which does not count for the bar
  assert.equal(r.barMet, false);
  assert.deepEqual(r.payouts, []);
  assert.equal(r.houseUnits, 2);
});

test("winning bar: 15.5 of 30 wins 70%", () => {
  const r = settleRound({
    entrantIds: ["a", "b"],
    entryFeeUnits: 1,
    minMatchPoints: 15,
    results: tenMatches,
    predictions: [
      ...slip("a", ["exact", "exact", "exact", "exact", "close", "result", "result", "wrong", "wrong", "wrong"]),
      ...slip("b", Array(10).fill("wrong"), 100),
    ],
  });
  assert.equal(r.standings[0].matchPoints, 15.5);
  assert.equal(r.barMet, true);
  assert.deepEqual(r.payouts, [{ userId: "a", units: 1.4 }]);
});

test("winning bar: tied slips above the bar share; a cancelled match lowers the bar", () => {
  const nine = tenMatches.slice(0, 9); // match 10 cancelled -> bar 13.5
  const k: ("exact" | "close" | "result" | "wrong")[] = ["exact", "exact", "exact", "exact", "result", "result", "wrong", "wrong", "wrong", "wrong"]; // 14
  const r = settleRound({
    entrantIds: ["a", "b", "c"],
    entryFeeUnits: 10,
    minMatchPoints: 13.5,
    results: nine,
    predictions: [...slip("a", k), ...slip("b", k, 100), ...slip("c", Array(10).fill("wrong"), 200)],
  });
  assert.equal(r.barMet, true);
  assert.deepEqual(r.payouts, [{ userId: "a", units: 10.5 }, { userId: "b", units: 10.5 }]);
});

test("free play without a bar still has a winner (free leagues)", () => {
  const r = settleRound({
    entrantIds: ["a", "b"],
    entryFeeUnits: 0,
    results: tenMatches,
    predictions: [...slip("a", ["exact", "wrong", "wrong", "wrong", "wrong", "wrong", "wrong", "wrong", "wrong", "wrong"])],
  });
  assert.equal(r.barMet, true);
  assert.equal(r.standings[0].userId, "a");
});
