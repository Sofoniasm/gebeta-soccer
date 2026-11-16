import { test } from "node:test";
import assert from "node:assert/strict";
import {
  challengeCommissions,
  commissionCents,
  commissionUnits,
  inviteLink,
  normalizeReferralCode,
  playerMoney,
  referralLookalikes,
  roundCommissions,
  salesScore,
} from "../lib/referrals";

// ---- codes and links ---------------------------------------------------------
test("referral codes: letters and digits, case-insensitive", () => {
  assert.equal(normalizeReferralCode(" laki10 "), "LAKI10");
  assert.equal(normalizeReferralCode("LAKI-10"), null);
  assert.equal(normalizeReferralCode("ab"), null);
  assert.equal(normalizeReferralCode(""), null);
  assert.equal(normalizeReferralCode(null), null);
  assert.equal(inviteLink("https://www.gebetasoccer.com/", "LAKI10"), "https://www.gebetasoccer.com/register?ref=LAKI10");
});

// ---- the maths ---------------------------------------------------------------
test("1 Unit slip, 30% house cut: 0.3 to the house, 0.015 commission -> 0.01 after rounding down", () => {
  assert.equal(commissionCents(1, 0.3, 0.05), 1);
  assert.equal(commissionUnits(1, 0.3, 0.05), 0.01);
});

test("integer cents: no floating-point drift", () => {
  assert.equal(commissionUnits(2, 0.3, 0.05), 0.03); // 0.6 * 5% = 0.03 exactly
  assert.equal(commissionUnits(10, 0.3, 0.05), 0.15);
  assert.equal(commissionUnits(3, 0.3, 0.05), 0.04); // 0.045 -> 0.04
  assert.equal(commissionUnits(0.5, 0.3, 0.05), 0); // 0.0075 -> skipped
  assert.equal(commissionUnits(100, 0.1, 0.02), 0.2); // challenge: 10 Unit fee * 2%
  assert.equal(commissionUnits(5, 0.1, 0.02), 0.01);
  assert.equal(commissionUnits(1, 0.1, 0.02), 0); // 0.002 -> skipped
});

test("commission is never more than the house's cut", () => {
  for (const stake of [1, 1.25, 7.5, 33, 250]) {
    for (const cut of [0.1, 0.25, 0.3, 0.333]) {
      assert.ok(commissionUnits(stake, cut, 0.05) <= stake * cut);
    }
  }
});

// ---- main rounds -------------------------------------------------------------
const ALL = ["abel", "bini", "chala", "sara"];
const referrers = { abel: "sara", bini: "sara", chala: null, sara: null };

test("main round: 5% of the house cut on each referred player's stakes (several slips added up)", () => {
  const out = roundCommissions({
    houseCut: 0.3,
    players: 3,
    finishedMatches: 10,
    ledger: [
      { userId: "abel", kind: "entry_fee", units: -1 },
      { userId: "abel", kind: "entry_fee", units: -1 },
      { userId: "bini", kind: "entry_fee", units: -10 },
      { userId: "chala", kind: "entry_fee", units: -50 },
    ],
    referrers,
    winners: ALL,
  });
  assert.deepEqual(out, [
    { salespersonId: "sara", playerId: "abel", stakeUnits: 2, units: 0.03 },
    { salespersonId: "sara", playerId: "bini", stakeUnits: 10, units: 0.15 },
  ]);
});

test("main round: solo refund pays no commission", () => {
  const out = roundCommissions({
    houseCut: 0.3, players: 1, finishedMatches: 10,
    ledger: [{ userId: "abel", kind: "entry_fee", units: -5 }, { userId: "abel", kind: "entry_fee", units: -5 }],
    referrers,
    winners: ALL,
  });
  assert.deepEqual(out, []);
});

test("main round: every match called off pays no commission", () => {
  const out = roundCommissions({
    houseCut: 0.3, players: 3, finishedMatches: 0,
    ledger: [{ userId: "abel", kind: "entry_fee", units: -5 }, { userId: "bini", kind: "entry_fee", units: -5 }],
    referrers,
    winners: ALL,
  });
  assert.deepEqual(out, []);
});

test("main round: a refunded slip counts 0", () => {
  const out = roundCommissions({
    houseCut: 0.3, players: 3, finishedMatches: 10,
    ledger: [
      { userId: "abel", kind: "entry_fee", units: -10 },
      { userId: "abel", kind: "refund", units: 10 },
      { userId: "bini", kind: "entry_fee", units: -10 },
      { userId: "bini", kind: "refund", units: 5 },
    ],
    referrers,
    winners: ALL,
  });
  assert.deepEqual(out, [{ salespersonId: "sara", playerId: "bini", stakeUnits: 5, units: 0.07 }]); // 5*0.3*0.05 = 0.075 -> 0.07
});

test("main round: only a friend who WON pays commission (still from the house cut)", () => {
  const base = { houseCut: 0.3, players: 3, finishedMatches: 10, ledger: [{ userId: "abel", kind: "entry_fee" as const, units: -10 }, { userId: "bini", kind: "entry_fee" as const, units: -10 }, { userId: "chala", kind: "entry_fee" as const, units: -10 }], referrers };
  assert.deepEqual(roundCommissions({ ...base, winners: ["abel"] }), [{ salespersonId: "sara", playerId: "abel", stakeUnits: 10, units: 0.15 }]);
  assert.deepEqual(roundCommissions({ ...base, winners: [] }), []); // nobody won: nothing
  assert.deepEqual(roundCommissions({ ...base, winners: ["chala"] }), []); // chala has no salesperson
});

test("no self-referral", () => {
  const out = roundCommissions({ houseCut: 0.3, players: 2, finishedMatches: 1, ledger: [{ userId: "sara", kind: "entry_fee", units: -10 }, { userId: "chala", kind: "entry_fee", units: -10 }], referrers: { sara: "sara" }, winners: ALL });
  assert.deepEqual(out, []);
});

// ---- challenges --------------------------------------------------------------
test("challenge: 2% of the 10% fee on the referred player's stake", () => {
  const out = challengeCommissions({ outcome: "settled", feePct: 0.1, stakeUnits: 50, entrants: ["abel", "chala"], referrers, winners: ALL });
  assert.deepEqual(out, [{ salespersonId: "sara", playerId: "abel", stakeUnits: 50, units: 0.1 }]);
});

test("challenge: a friend who lost pays no commission", () => {
  assert.deepEqual(challengeCommissions({ outcome: "settled", feePct: 0.1, stakeUnits: 50, entrants: ["abel", "chala"], referrers, winners: ["chala"] }), []);
});

test("challenge: refunded (nobody joined / called off) pays no commission", () => {
  assert.deepEqual(challengeCommissions({ outcome: "refunded", feePct: 0.1, stakeUnits: 50, entrants: ["abel", "bini"], referrers, winners: ALL }), []);
  assert.deepEqual(challengeCommissions({ outcome: "settled", feePct: 0.1, stakeUnits: 50, entrants: ["abel"], referrers, winners: ALL }), []);
});

// ---- fraud -------------------------------------------------------------------
test("referred players that look like the salesperson are flagged", () => {
  const flags = referralLookalikes({
    salesperson: { id: "sara", username: "sara", phone_number: "0911000001" },
    referred: [
      { id: "abel", username: "abel", phone_number: "0911000002" },
      { id: "bini", username: "bini", phone_number: "0911000003", referral_ip: "10.0.0.9" },
      { id: "chala", username: "chala", phone_number: "0911000004" },
    ],
    withdrawals: [
      { user_id: "abel", payout_phone: "0911000001", status: "pending" },
      { user_id: "sara", payout_phone: "0922000000", status: "paid" },
      { user_id: "chala", payout_phone: "0911000001", status: "rejected" },
    ],
    logins: [{ user_id: "sara", ip: "10.0.0.9" }],
  });
  assert.deepEqual(flags.map((f) => f.username), ["abel", "bini"]);
  assert.match(flags[0].reasons[0], /salesperson's phone/);
  assert.match(flags[1].reasons[0], /Same IP/);
});

// ---- admin money summary -----------------------------------------------------
test("player money: deposits, stakes, refunds, wins, withdrawals and the house cut", () => {
  const row = (kind: string, amount_units: number, g: { r?: number; c?: number; l?: number } = {}) =>
    ({ user_id: "abel", kind, amount_units, round_id: g.r ?? null, challenge_id: g.c ?? null, league_id: g.l ?? null });
  const rounds = new Map([[1, { pct: 0.3, settled: true }], [2, { pct: 0.3, settled: true }], [3, { pct: 0.3, settled: false }]]);
  const challenges = new Map([[9, { pct: 0.1, settled: true }]]);
  const m = playerMoney(
    [
      row("deposit", 20),
      row("entry_fee", -2, { r: 1 }), row("entry_fee", -1, { r: 1 }), // settled round: 3 Units
      row("payout", 4.2, { r: 1 }),
      row("entry_fee", -5, { r: 2 }), row("refund", 5, { r: 2 }),       // solo refund: no house cut
      row("entry_fee", -1, { r: 3 }),                                    // still open: no house cut yet
      row("entry_fee", -10, { c: 9 }),                                   // settled challenge
      row("entry_fee", -2, { l: 4 }),                                    // league: staked, no house cut here
      row("withdrawal", -3), row("refund", 3),                           // withdrawal rejected and sent back
      row("withdrawal", -2),
    ],
    rounds,
    challenges,
  ).get("abel")!;
  assert.deepEqual(m, { deposited: 20, staked: 16, refunded: 5, won: 4.2, withdrawn: 2, houseCut: 1.9 }); // 3*0.3 + 10*0.1
});

// ---- Sales score -------------------------------------------------------------
test("sales score and level", () => {
  assert.deepEqual(salesScore(0, 0, 0), { points: 0, level: "Starter", next: "Bronze", toNext: 10 });
  assert.equal(salesScore(5, 2, 1).points, 5 + 4 + 5); // 14
  assert.equal(salesScore(5, 2, 1).level, "Bronze");
  assert.equal(salesScore(30, 15, 10).level, "Silver"); // 30 + 30 + 50 = 110
  assert.equal(salesScore(60, 40, 20).level, "Gold"); // 60 + 80 + 100 = 240
});
