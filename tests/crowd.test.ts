import { test } from "node:test";
import assert from "node:assert/strict";
import { crowdSplit, toCrowdMap } from "../lib/crowd";

test("crowd rows become a map by match id (numbers from the database may be strings)", () => {
  const m = toCrowdMap([
    { match_id: "7", picks: "339", home_pct: "62", draw_pct: "4", away_pct: "34" },
    { match_id: 8, picks: 3, home_pct: null, draw_pct: null, away_pct: null },
  ]);
  assert.deepEqual(m[7], { picks: 339, home: 62, draw: 4, away: 34 });
  assert.deepEqual(m[8], { picks: 3, home: null, draw: null, away: null });
});

test("split is shown only when the database sent it", () => {
  assert.deepEqual(crowdSplit({ picks: 339, home: 62, draw: 4, away: 34 }), { home: 62, draw: 4, away: 34 });
  assert.equal(crowdSplit({ picks: 339, home: null, draw: null, away: null }), null); // before kickoff, not Premium
  assert.equal(crowdSplit(undefined), null);
});
