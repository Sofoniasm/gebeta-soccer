import { test } from "node:test";
import assert from "node:assert/strict";
import { autoRoundName, MIN_ROUND_MATCHES, eatDate, pickSlotMatches, slotOf, slotWindow, splitRoundName } from "../lib/round-slots";

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
  assert.equal(slotOf("2026-11-12T22:00:00Z"), "late"); // 01:00 EAT next day: Late night slot
  assert.equal(slotOf("2026-11-13T02:59:00Z"), "late"); // 05:59 EAT
  assert.equal(slotOf("2026-11-13T03:00:00Z"), "morning"); // 06:00 EAT
  // 23:30 UTC on the 12th is already the 13th in Addis
  assert.equal(eatDate(new Date("2026-11-12T23:30:00Z")), "2026-11-13");
  assert.equal(eatDate(new Date("2026-11-12T20:00:00Z"), 1), "2026-11-13");
  assert.equal(autoRoundName("2026-11-12", "evening"), "የከሰዓት 10 · Evening · Thu 12 Nov");
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
  assert.equal(pickSlotMatches(all, "2026-11-12", "night", now), null); // only 4 night games (minimum is 5)
  assert.equal(pickSlotMatches(all, "2026-11-12", "morning", now), null);
  // 11:30 EAT: the 12:00 games are less than an hour away, so they don't count: 9 left, still a round (5 to 10)
  const late = new Date(Date.UTC(2026, 10, 12, 8, 30));
  assert.equal(pickSlotMatches(evening, "2026-11-12", "evening", late)!.length, 9);
});

test("smaller rounds: 5 to 9 matches open once the first game is within 24 hours", () => {
  assert.equal(MIN_ROUND_MATCHES, 5);
  const at = (day: number, h: number, m = 0) => ({ kickoff_at: new Date(Date.UTC(2026, 10, day, h - 3, m)).toISOString() });
  const seven = Array.from({ length: 7 }, (_, i) => at(13, 20, i * 5)); // 7 night games on the 13th (EAT)
  const soon = new Date(Date.UTC(2026, 10, 13, 5)); // 08:00 EAT the same day: first game in 12h
  assert.equal(pickSlotMatches(seven, "2026-11-13", "night", soon)!.length, 7);
  const far = new Date(Date.UTC(2026, 10, 11, 5)); // two days before: wait for the full fixture list
  assert.equal(pickSlotMatches(seven, "2026-11-13", "night", far), null);
  const four = seven.slice(0, 4);
  assert.equal(pickSlotMatches(four, "2026-11-13", "night", soon), null); // fewer than 5: never
  const twelve = Array.from({ length: 12 }, (_, i) => at(13, 20, i));
  assert.equal(pickSlotMatches(twelve, "2026-11-13", "night", far)!.length, 10); // 10+: right away
  assert.equal(autoRoundName("2026-11-13", "night", 7), "የምሽት 7 · Night · Fri 13 Nov");
});

test("late night slot: Brazilian games at 01:30-03:30 EAT get their own round", () => {
  // Thu 19 Nov 2026, 01:30-03:30 EAT = Wed 18 Nov 22:30-00:30 UTC
  const br = [
    "2026-11-18T22:30:00Z", "2026-11-18T23:00:00Z", "2026-11-18T23:30:00Z",
    "2026-11-18T23:30:00Z", "2026-11-19T00:30:00Z", "2026-11-19T00:30:00Z",
  ].map((kickoff_at, i) => ({ id: i, kickoff_at }));
  const w = slotWindow("2026-11-19", "late");
  assert.equal(w.start.toISOString(), "2026-11-18T21:00:00.000Z"); // 00:00 EAT
  assert.equal(w.end.toISOString(), "2026-11-19T03:00:00.000Z"); // 06:00 EAT
  const noon = new Date("2026-11-18T09:00:00Z"); // Wed 12:00 EAT: first game within 24 h
  assert.equal(pickSlotMatches(br, "2026-11-19", "late", noon)!.length, 6);
  assert.equal(autoRoundName("2026-11-19", "late", 6), "የሌሊት 6 · Late night · Thu 19 Nov");
  assert.deepEqual(splitRoundName("የሌሊት 6 · Late night · Thu 19 Nov"), { main: "የሌሊት 6", sub: "Late night · Thu 19 Nov" });
  assert.deepEqual(splitRoundName("Evening 10 · Thu 12 Nov"), { main: "Evening 10 · Thu 12 Nov", sub: null }); // older rounds unchanged
});
