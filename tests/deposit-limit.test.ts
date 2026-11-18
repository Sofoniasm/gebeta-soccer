import { test } from "node:test";
import assert from "node:assert/strict";
import { limitOutlook } from "../lib/deposit-limit";

const day = 86_400_000;
const NOW = new Date("2026-11-18T11:44:00Z"); // Wed 18 Nov, 14:44 EAT

test("laki's case: 61.5 Units used, limit 25 -> next deposit when the deposits turn 7 days old", () => {
  const o = limitOutlook({
    deposits: [
      { units: 50, at: "2026-11-12T09:00:00Z" }, // 10,000 ETB
      { units: 11.5, at: "2026-11-13T07:03:00Z" }, // 2,300 ETB (13 Nov 10:03 EAT)
    ],
    limitUnits: 25,
    minUnits: 5,
    now: NOW,
  });
  assert.equal(o.leftNow, 0);
  // 19 Nov 09:00 UTC the 50 drops off: 25 - 11.5 = 13.5 Units free (2,700 ETB)
  assert.equal(o.nextDepositAt?.toISOString(), "2026-11-19T09:00:00.000Z");
  assert.equal(o.leftAtNext, 13.5);
  // 20 Nov 07:03 UTC (10:03 EAT) everything is free again
  assert.equal(o.fullRoomAt?.toISOString(), "2026-11-20T07:03:00.000Z");
});

test("room now: no dates", () => {
  const o = limitOutlook({ deposits: [{ units: 10, at: new Date(NOW.getTime() - day).toISOString() }], limitUnits: 25, minUnits: 5, now: NOW });
  assert.equal(o.leftNow, 15);
  assert.equal(o.nextDepositAt, null);
  assert.equal(o.fullRoomAt?.toISOString(), new Date(NOW.getTime() + 6 * day).toISOString());
});

test("no limit: everything fits", () => {
  const o = limitOutlook({ deposits: [{ units: 500, at: NOW.toISOString() }], limitUnits: null, minUnits: 5, now: NOW });
  assert.equal(o.leftNow, Infinity);
  assert.equal(o.nextDepositAt, null);
  assert.equal(o.fullRoomAt, null);
});

test("a raise the player asked for counts from its date", () => {
  const o = limitOutlook({
    deposits: [{ units: 25, at: new Date(NOW.getTime() - day).toISOString() }],
    limitUnits: 25,
    nextUnits: 100,
    nextAt: new Date(NOW.getTime() + 2 * day).toISOString(),
    minUnits: 5,
    now: NOW,
  });
  assert.equal(o.leftNow, 0);
  assert.equal(o.nextDepositAt?.toISOString(), new Date(NOW.getTime() + 2 * day).toISOString()); // raise applies first
  assert.equal(o.leftAtNext, 75);
});

test("removing the limit: no limit from its date", () => {
  const o = limitOutlook({
    deposits: [{ units: 30, at: NOW.toISOString() }],
    limitUnits: 25,
    nextUnits: null,
    nextAt: new Date(NOW.getTime() + 3 * day).toISOString(),
    minUnits: 5,
    now: NOW,
  });
  assert.equal(o.nextDepositAt?.toISOString(), new Date(NOW.getTime() + 3 * day).toISOString());
  assert.equal(o.leftAtNext, Infinity);
  assert.equal(o.fullRoomAt?.toISOString(), new Date(NOW.getTime() + 3 * day).toISOString());
});

test("less than the smallest deposit left counts as no room", () => {
  const o = limitOutlook({ deposits: [{ units: 22, at: NOW.toISOString() }], limitUnits: 25, minUnits: 5, now: NOW });
  assert.equal(o.leftNow, 3);
  assert.equal(o.nextDepositAt?.toISOString(), new Date(NOW.getTime() + 7 * day).toISOString());
});
