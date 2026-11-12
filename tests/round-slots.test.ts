import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRoundName, eatDate, pickSlotMatches, slotOf, slotWindow } from "../lib/round-slots";

test("slots: Ethiopian time windows", () => {
  const w = slotWindow("2026-11-12", "morning");
  assert.equal(w.start.toISOString(), "2026-11-12T03:00:00.000Z"); // 06:00 EAT
  assert.equal(w.end.toISOString(), "2026-11-12T09:00:00.000Z"); // 12:00 EAT
  const n = slotWindow("2026-11-12", "night");
  assert.equal(n.start.toISOString(), "2026-11-12T16:00:00.000Z"); // 19:00 EAT
  assert.equal(n.end.toISOString(), "2026-11-12T21:00:00.000Z"); // 24:00 EAT
  assert.equal(slotOf("2026-11-12T08:59:00Z"), "morning"); // 11:59 EAT
  assert.equal(slotOf("2026-11-12T09:00:00Z"), "evening"); // 12:00 EAT
  assert.equal(slotOf("2026-11-12T15:59:00Z"), "evening"); // 18:59 EAT
  assert.equal(slotOf("2026-11-12T16:00:00Z"), "night"); // 19:00 EAT
  assert.equal(slotOf("2026-11-12T22:00:00Z"), null); // 01:00 EAT next day
  // 23:30 UTC on the 12th is already the 13th in Addis
  assert.equal(eatDate(new Date("2026-11-12T23:30:00Z")), "2026-11-13");
  assert.equal(eatDate(new Date("2026-11-12T20:00:00Z"), 1), "2026-11-13");
  assert.equal(autoRoundName("2026-11-12", "evening"), "Evening 10 · Thu 12 Nov");
});

test("slots: 10 matches from one slot only, never mixed, with time to play", () => {
  const at = (h: number, m = 0) => ({ kickoff_at: new Date(Date.UTC(2026, 10, 12, h - 3, m)).toISOString() });
  const evening = Array.from({ length: 11 }, (_, i) => at(12 + (i % 7), i));
  const night = Array.from({ length: 4 }, (_, i) => at(20 + i));
  const all = [...night, ...evening];
  const now = new Date(Date.UTC(2026, 10, 12, 5)); // 08:00 EAT
  const picked = pickSlotMatches(all, "2026-11-12", "evening", now)!;
  assert.equal(picked.length, 10);
  assert.ok(picked.every((m) => slotOf(m.kickoff_at) === "evening"));
  assert.equal(picked[0].kickoff_at, at(12, 0).kickoff_at); // earliest first
  assert.equal(pickSlotMatches(all, "2026-11-12", "night", now), null); // only 4 night games
  assert.equal(pickSlotMatches(all, "2026-11-12", "morning", now), null);
  // 11:30 EAT: the 12:00 games are less than an hour away, so they don't count -> fewer than 10
  const late = new Date(Date.UTC(2026, 10, 12, 8, 30));
  assert.equal(pickSlotMatches(evening, "2026-11-12", "evening", late), null); // 12:00 and 12:07 drop out, 9 left
});
