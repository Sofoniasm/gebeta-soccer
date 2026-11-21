import { test } from "node:test";
import assert from "node:assert/strict";
import { royaleError, royalePoints, shuffleDraft, validateRoyaleDraft } from "../lib/royale";

test("royale points: 100 for a right answer + up to 100 for speed, 0 for a wrong one", () => {
  assert.equal(royalePoints(false, 100), 0);
  assert.equal(royalePoints(true, 0), 200);
  assert.equal(royalePoints(true, 7500), 150);
  assert.equal(royalePoints(true, 15000), 100);
  assert.equal(royalePoints(true, 99999), 100); // late is capped, never below 100
  assert.equal(royalePoints(true, -50), 200);
});

test("royale errors are plain words", () => {
  assert.match(royaleError("insufficient balance"), /Not enough Units/);
  assert.match(royaleError("you already joined this room"), /already in this room/);
  assert.match(royaleError("need at least 3 players"), /at least 3 players/);
  assert.match(royaleError("time is up for this question"), /Too late/);
  assert.match(royaleError("boom"), /Something went wrong/);
});

test("royale AI questions: checked before they enter the bank", () => {
  const ok = { topic: "football", question: "Which country won the 2022 World Cup?", options: ["France", "Argentina", "Croatia", "Brazil"], correct: 1 };
  assert.equal(validateRoyaleDraft(ok), null);
  assert.match(validateRoyaleDraft({ ...ok, options: ["a", "b", "c"] }) ?? "", /exactly 4/);
  assert.match(validateRoyaleDraft({ ...ok, options: ["a", "A", "c", "d"] }) ?? "", /different/);
  assert.match(validateRoyaleDraft({ ...ok, correct: 4 }) ?? "", /0 to 3/);
  assert.match(validateRoyaleDraft({ ...ok, question: "Short?" }) ?? "", /8 to 300/);
});

test("royale AI questions: shuffling keeps the right answer pointing at the same text", () => {
  const q = { topic: "t", question: "Which one is right here?", options: ["right", "w1", "w2", "w3"], correct: 0 };
  for (const rnd of [() => 0.1, () => 0.9, Math.random, () => 0.5]) {
    const s = shuffleDraft(q, rnd);
    assert.equal(s.options[s.correct], "right");
    assert.deepEqual([...s.options].sort(), ["right", "w1", "w2", "w3"]);
  }
});
