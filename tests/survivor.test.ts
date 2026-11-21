import { test } from "node:test";
import assert from "node:assert/strict";
import { survivorDayLabel, survivorError, survivorStatusLabel } from "../lib/survivor";

test("survivor errors are plain words", () => {
  assert.match(survivorError("insufficient balance"), /Not enough Units/);
  assert.match(survivorError("you already joined this pool"), /already in this pool/);
  assert.match(survivorError("need at least 5 players"), /at least 5 players/);
  assert.match(survivorError("you already used Arsenal in this pool"), /already used Arsenal.*another team/);
  assert.match(survivorError("picks for this day are closed"), /closed/);
  assert.match(survivorError("no match day is available yet"), /No match day/);
  assert.match(survivorError("you are not alive in this pool"), /out of this pool/);
  assert.match(survivorError("boom"), /Something went wrong/);
});

test("survivor labels", () => {
  assert.equal(survivorStatusLabel("open"), "Waiting for players");
  assert.equal(survivorStatusLabel("settled"), "Finished");
  assert.equal(survivorDayLabel("2026-11-22"), "Sun 22 Nov");
  assert.equal(survivorDayLabel("garbage"), "garbage");
});
