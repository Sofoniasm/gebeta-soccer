import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDob, safeNextPath } from "../lib/onboarding";

const NOW = new Date("2026-11-21T09:00:00Z"); // 21 Nov 2026 in Addis

test("onboarding date of birth: day/month/year as people type it", () => {
  for (const [text, iso] of [
    ["14/03/1995", "1995-03-14"],
    ["14-3-1995", "1995-03-14"],
    ["14.03.1995", "1995-03-14"],
    [" 1995-03-14 ", "1995-03-14"],
    ["1/1/1990", "1990-01-01"],
    ["14 03 1995", "1995-03-14"],
  ] as const) {
    assert.deepEqual(parseDob(text, NOW), { ok: true, iso }, text);
  }
});

test("onboarding: exactly 18 today is allowed, one day younger is declined", () => {
  assert.deepEqual(parseDob("21/11/2008", NOW), { ok: true, iso: "2008-11-21" });
  assert.deepEqual(parseDob("22/11/2008", NOW), { ok: false, reason: "under18" });
  assert.deepEqual(parseDob("01/01/2015", NOW), { ok: false, reason: "under18" });
});

test("onboarding: unreadable or impossible dates are asked again, not accepted", () => {
  assert.deepEqual(parseDob("hello", NOW), { ok: false, reason: "format" });
  assert.deepEqual(parseDob("14/03/95", NOW), { ok: false, reason: "format" });
  assert.deepEqual(parseDob("14/03", NOW), { ok: false, reason: "format" });
  assert.deepEqual(parseDob("30/02/1995", NOW), { ok: false, reason: "invalid" });
  assert.deepEqual(parseDob("14/13/1995", NOW), { ok: false, reason: "invalid" });
  assert.deepEqual(parseDob("14/03/1850", NOW), { ok: false, reason: "invalid" });
});

test("onboarding: the page to open after sign-up must stay on our own site", () => {
  assert.equal(safeNextPath("/dashboard?round=5&new=1#slip"), "/dashboard?round=5&new=1#slip");
  assert.equal(safeNextPath("//evil.com"), null);
  assert.equal(safeNextPath("https://evil.com"), null);
  assert.equal(safeNextPath(null), null);
});
