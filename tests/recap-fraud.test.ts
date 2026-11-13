import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoundRecaps, ordinal } from "../lib/round-recap";
import { detectFraud, RULES } from "../lib/fraud-rules";

test("ordinal", () => {
  assert.deepEqual([1, 2, 3, 4, 11, 12, 13, 21, 22, 101].map(ordinal), ["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st"]);
});

const base = () => ({
  roundName: "Saturday Evening",
  standings: [
    { slipId: "10", rank: 1, totalPoints: 18.5, exactScores: 3, correctResults: 7 },
    { slipId: "11", rank: 4, totalPoints: 9, exactScores: 1, correctResults: 4 },
    { slipId: "12", rank: 2, totalPoints: 12, exactScores: 2, correctResults: 5 },
  ],
  slips: new Map([
    ["10", { user_id: "A", slip_no: 1 }],
    ["11", { user_id: "B", slip_no: 1 }],
    ["12", { user_id: "B", slip_no: 2 }],
  ]),
  picks: [
    { id: 1, slip_id: 10, match_id: 100, home: 2, away: 1 },
    { id: 2, slip_id: 11, match_id: 100, home: 1, away: 0 },
    { id: 3, slip_id: 12, match_id: 100, home: 3, away: 1 },
  ],
  pointsByPick: new Map([[1, 3], [2, 1], [3, 1.5]]),
  matches: new Map([[100, { home_team: "Arsenal", away_team: "Chelsea", actual_home_score: 2, actual_away_score: 1 }]]),
  payoutBySlip: new Map([["10", 2.1]]),
  langOf: (id: string) => (id === "B" ? ("am" as const) : ("en" as const)),
});

test("one recap per player, winner and best call", () => {
  const notes = buildRoundRecaps(base());
  assert.equal(notes.length, 2);
  const a = notes.find((n) => n.user_id === "A")!;
  assert.match(a.title, /Saturday Evening settled/);
  assert.match(a.body, /Your slip finished 1st of 3 with 18\.5 points/);
  assert.match(a.body, /Best call: Arsenal 2-1 Chelsea \(exact!\)/);
  assert.match(a.body, /You won/);
});

test("player with two slips gets their best slip, in Amharic", () => {
  const b = buildRoundRecaps(base()).find((n) => n.user_id === "B")!;
  assert.match(b.body, /ምርጥ ስሊፕዎ \(#2\) ከ3 ውስጥ 2ኛ/);
  assert.match(b.body, /Arsenal 3-1 Chelsea \(ቅርብ፣ ውጤቱ 2-1\)/);
  assert.match(b.body, /ሽልማት የለም/);
});

const P = (id: string, phone: string, created = "2026-10-01T00:00:00Z", extra = {}) => ({ id, username: id, phone_number: phone, created_at: created, ...extra });

test("fraud: shared payout number and cashing out to another player's phone", () => {
  const flagged = detectFraud({
    profiles: [P("a", "+251911000001"), P("b", "+251911000002"), P("c", "+251911000003")],
    ledger: [
      { user_id: "a", kind: "deposit", amount_units: 5, created_at: "2026-10-02T00:00:00Z" },
      { user_id: "a", kind: "entry_fee", amount_units: -5, created_at: "2026-10-02T01:00:00Z" },
      { user_id: "b", kind: "deposit", amount_units: 5, created_at: "2026-10-02T00:00:00Z" },
      { user_id: "b", kind: "entry_fee", amount_units: -5, created_at: "2026-10-02T01:00:00Z" },
    ],
    withdrawals: [
      { user_id: "a", units: 2, payout_phone: "0911000003", status: "pending", created_at: "2026-10-20T00:00:00Z" },
      { user_id: "b", units: 2, payout_phone: "+251911000003", status: "paid", created_at: "2026-10-20T00:00:00Z" },
    ],
    logins: [],
  });
  const a = flagged.find((f) => f.user.id === "a")!;
  assert.ok(a.flags.some((x) => x.rule === RULES.sharedPayout && x.related.includes("b")));
  assert.ok(a.flags.some((x) => x.rule === RULES.payoutIsOtherPlayer && x.related.includes("c")));
  assert.ok(!flagged.some((f) => f.user.id === "c"), "c never withdrew");
});

test("fraud: money in and out without playing, new account, admins skipped, rejected ignored", () => {
  const flagged = detectFraud({
    profiles: [P("n", "+251911000010", "2026-11-10T00:00:00Z"), P("adm", "+251911000011", "2026-11-10T00:00:00Z", { is_admin: true }), P("r", "+251911000012")],
    ledger: [
      { user_id: "n", kind: "adjustment", amount_units: 10, created_at: "2026-11-10T01:00:00Z" },
      { user_id: "adm", kind: "deposit", amount_units: 10, created_at: "2026-11-10T01:00:00Z" },
      { user_id: "r", kind: "deposit", amount_units: 10, created_at: "2026-10-10T01:00:00Z" },
    ],
    withdrawals: [
      { user_id: "n", units: 10, payout_phone: "+251911000010", status: "pending", created_at: "2026-11-10T05:00:00Z" },
      { user_id: "adm", units: 10, payout_phone: "+251911000011", status: "pending", created_at: "2026-11-10T05:00:00Z" },
      { user_id: "r", units: 10, payout_phone: "+251911000012", status: "rejected", created_at: "2026-11-10T05:00:00Z" },
    ],
    logins: [],
  });
  assert.deepEqual(flagged.map((f) => f.user.id), ["n"]);
  const rules = flagged[0].flags.map((x) => x.rule);
  assert.ok(rules.includes(RULES.noPlay));
  assert.ok(rules.includes(RULES.newAccountCashout));
  assert.match(flagged[0].flags[0].reason, /bonus/);
});

test("fraud: shared IP needs 3+ accounts and is low severity", () => {
  const profiles = [P("x", "+251911000020"), P("y", "+251911000021"), P("z", "+251911000022")];
  const login = (k: string, ip: string) => ({ login_key: k, ip, created_at: "2026-11-01T00:00:00Z" });
  assert.equal(detectFraud({ profiles, ledger: [], withdrawals: [], logins: [login("x", "1.1.1.1"), login("+251911000021", "1.1.1.1")] }).length, 0);
  const f = detectFraud({ profiles, ledger: [], withdrawals: [], logins: [login("x", "1.1.1.1"), login("+251911000021", "1.1.1.1"), login("z", "1.1.1.1")] });
  assert.equal(f.length, 3);
  assert.ok(f.every((x) => x.flags[0].severity === "low" && x.score === 1));
});
