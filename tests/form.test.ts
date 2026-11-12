import { test } from "node:test";
import assert from "node:assert/strict";
import { buildForm, formChances } from "../lib/form";

const m = (h: string, a: string, hs: number, as: number, day: number) => ({
  home_team: h, away_team: a, actual_home_score: hs, actual_away_score: as, kickoff_at: new Date(Date.UTC(2026, 9, day, 15)).toISOString(),
});

test("form: last 5 per team, newest on the right, home and away", () => {
  const list = [
    m("Arsenal", "Chelsea", 2, 1, 1), // W (oldest, drops out)
    m("Spurs", "Arsenal", 0, 0, 5), // D
    m("Arsenal", "Leeds", 3, 0, 9), // W
    m("Everton", "Arsenal", 2, 1, 13), // L
    m("Arsenal", "Fulham", 1, 0, 17), // W
    m("Wolves", "Arsenal", 1, 4, 21), // W (newest)
    m("Chelsea", "Leeds", 1, 1, 22),
  ];
  const f = buildForm(["Arsenal", "Leeds", "Nobody"], list);
  assert.deepEqual(f.Arsenal.map((x) => x.r), ["D", "W", "L", "W", "W"]);
  assert.match(f.Arsenal[4].t, /^4-1 vs Wolves \(A\) · 21 Oct$/);
  assert.match(f.Arsenal[2].t, /^1-2 vs Everton \(A\)/);
  assert.deepEqual(f.Leeds.map((x) => x.r), ["L", "D"]);
  assert.deepEqual(f.Nobody, []);
});

test("form chances: add to 100, favour the better side, need 3 results each", () => {
  const W = { r: "W" as const, t: "" }, L = { r: "L" as const, t: "" }, D = { r: "D" as const, t: "" };
  const strong = formChances([W, W, W, W, W], [L, L, L, L, L])!;
  const weak = formChances([L, L, L, L, L], [W, W, W, W, W])!;
  const even = formChances([W, D, L], [W, D, L])!;
  for (const c of [strong, weak, even]) {
    assert.equal(c.home + c.draw + c.away, 100);
    assert.ok(c.home >= 5 && c.draw >= 5 && c.away >= 5);
  }
  assert.ok(strong.home > strong.away && weak.away > weak.home);
  assert.ok(even.home > even.away); // home advantage
  assert.equal(formChances([W, W], [W, W, W]), null);
});
