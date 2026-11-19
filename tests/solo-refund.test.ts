import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distinctPlayers,
  isSoloEntry,
  myPrize,
  myPrizeText,
  myWinUnits,
  winFromOthersUnits,
  slipBreakdown,
  playersLabel,
  soloRefunds,
  SOLO_REFUND_MESSAGE,
  WAITING_MESSAGE,
} from "../lib/solo";
import { challengePrizeUnits } from "../lib/challenges";
import { settleRound, singleWinnerPrizeUnits } from "../lib/settlement";

const pick1 = (user: string, h: number, a: number) => ({ predictionId: user === "s1" ? 1 : 2, userId: user, matchId: 1, predictedHome: h, predictedAway: a });
import { buildRoundRecaps } from "../lib/round-recap";

// ---- who counts as "solo" ---------------------------------------------------
test("one user with several slips is still one player", () => {
  assert.equal(distinctPlayers(["a", "a", "a"]), 1);
  assert.equal(isSoloEntry(["a", "a", "a"]), true);
  assert.equal(isSoloEntry(["a"]), true);
  assert.equal(isSoloEntry(["a", "b"]), false);
  assert.equal(isSoloEntry(["a", "a", "b"]), false);
  assert.equal(isSoloEntry([]), false); // nobody: nothing to refund
});

// ---- solo refund: every stake back, no house fee ---------------------------
test("solo refund returns every stake in full (3 slips × 5 Units)", () => {
  const stakes = [1, 2, 3].map(() => ({ userId: "a", units: 5 }));
  assert.deepEqual(soloRefunds(stakes), [{ userId: "a", units: 15 }]);
});

test("solo refund adds up quarter-Unit stakes without float drift", () => {
  const stakes = [0.25, 0.25, 0.25, 0.1, 0.2].map((units) => ({ userId: "a", units }));
  assert.deepEqual(soloRefunds(stakes), [{ userId: "a", units: 1.05 }]);
});

test("no solo refund when a second player is in", () => {
  assert.equal(soloRefunds([{ userId: "a", units: 5 }, { userId: "b", units: 5 }]), null);
});

test("solo: refund equals the whole pool, the house gets nothing", () => {
  // Without the solo rule the scorer would treat the lone player's 2nd slip as "another player" and keep a fee.
  const r = settleRound({
    entrantIds: ["s1", "s2"],
    entryFeeUnits: 5,
    results: [{ matchId: 1, homeScore: 1, awayScore: 0 }],
    predictions: [pick1("s1", 1, 0), pick1("s2", 0, 3)],
  });
  assert.equal(r.poolUnits, 10);
  assert.ok(r.houseUnits > 0, "plain settlement keeps a house fee");
  const refunds = soloRefunds([{ userId: "a", units: 5 }, { userId: "a", units: 5 }])!;
  const refunded = refunds.reduce((s, x) => s + x.units, 0);
  assert.equal(refunded, r.poolUnits);
});

// ---- what a player sees -----------------------------------------------------
test("nobody else in: waiting, no prize amount", () => {
  const p = myPrize(challengePrizeUnits(5, 1), 5, 0);
  assert.deepEqual(p, { kind: "waiting" });
  assert.equal(myPrizeText(p), WAITING_MESSAGE);
  assert.equal(WAITING_MESSAGE, "Waiting for players. Your stake comes back in full if nobody joins.");
  assert.doesNotMatch(myPrizeText(p), /ETB/);
});

test("challenge, 2 players, 1,000 ETB stake, 10% fee only on the other player's stake", () => {
  const x = challengePrizeUnits(5, 2); // 9.5 Units = 1,900 ETB
  const p = myPrize(x, 5, 1);
  assert.deepEqual(p, { kind: "prize", winUnits: 9.5, ownUnits: 5, fromOthersUnits: 4.5 });
  assert.equal(myWinUnits(p), 4.5); // big number: 900 ETB won from the other player, after the 10% cut
  assert.equal(myPrizeText(p), "+ your 1,000 ETB stake comes back if you win");
});

test("league, 4 members, 5 Units fee, 30% house", () => {
  const prize = singleWinnerPrizeUnits(5, 4, 0.3); // 5 back + 15 x 0.7 = 15.5 Units
  const p = myPrize(prize, 5, 3);
  assert.equal(p.kind, "prize");
  if (p.kind !== "prize") return;
  assert.equal(p.winUnits, 15.5);
  assert.equal(p.ownUnits, 5);
  assert.equal(p.fromOthersUnits, 10.5);
  assert.equal(myWinUnits(p), 10.5); // big number: 2,100 ETB from the 3 others after the 30% cut
  assert.equal(myPrizeText(p), "+ your 1,000 ETB stake comes back if you win");
});

test("round: X = Y + Z always holds, in hundredths", () => {
  for (const [prize, stake] of [[0.3, 0.1], [7, 5], [12.6, 2.5], [1.05, 0.35]] as const) {
    const p = myPrize(prize, stake, 1);
    assert.equal(p.kind, "prize");
    if (p.kind !== "prize") continue;
    assert.equal(Math.round((p.ownUnits + p.fromOthersUnits) * 100), Math.round(p.winUnits * 100));
  }
  const p = myPrize(0.3, 0.1, 1);
  assert.equal(p.kind === "prize" && p.fromOthersUnits, 0.2); // not 0.19999999999999998
});

test("big number never counts your own stake or our cut (2 players x 200 ETB -> 140 ETB)", () => {
  const fromOthers = winFromOthersUnits(1, 0.3); // the other player's 200 ETB slip, 30% cut
  assert.equal(fromOthers, 0.7); // 140 ETB
  const p = myPrize(1 + fromOthers, 1, 1);
  assert.equal(myWinUnits(p), 0.7);
  assert.equal(myPrizeText(p), "+ your 200 ETB stake comes back if you win");
  // more players join: the number grows by itself (3 others -> 420 ETB)
  assert.equal(winFromOthersUnits(3, 0.3), 2.1);
  // your own extra slips are never counted as winnings
  assert.equal(winFromOthersUnits(0, 0.3), 0);
  assert.equal(myWinUnits(myPrize(1, 1, 0)), null); // nobody else: waiting, no amount
});

test("players box: N + you", () => {
  assert.equal(playersLabel(1, true), "0 + you");
  assert.equal(playersLabel(4, true), "3 + you");
  assert.equal(playersLabel(1, false), "1 player");
  assert.equal(playersLabel(3, false), "3 players");
});

// ---- the round recap tells the player --------------------------------------
test("solo round recap says the stake was refunded, not 'no prize'", () => {
  const notes = buildRoundRecaps({
    roundName: "Sunday",
    standings: [
      { slipId: "1", rank: 1, totalPoints: 6, exactScores: 1, correctResults: 2 },
      { slipId: "2", rank: 2, totalPoints: 3, exactScores: 0, correctResults: 1 },
    ],
    slips: new Map([["1", { user_id: "A", slip_no: 1 }], ["2", { user_id: "A", slip_no: 2 }]]),
    picks: [],
    pointsByPick: new Map(),
    matches: new Map(),
    payoutBySlip: new Map(),
    langOf: () => "en",
    soloRefund: true,
  });
  assert.equal(notes.length, 1);
  assert.match(notes[0].body, new RegExp(SOLO_REFUND_MESSAGE.replace(/\./g, "\\.")));
  assert.doesNotMatch(notes[0].body, /No prize|You won/);
  assert.equal(SOLO_REFUND_MESSAGE, "Nobody else joined, so your stake was refunded in full.");
});

test("slip breakdown: 3 own slips + 1 other at 200 ETB, 30% cut (the 19 Nov example)", () => {
  const b = slipBreakdown(1, 3, 4, 0.3)!;
  assert.deepEqual(b, { stakeBack: 1, fromOthers: 0.7, fromMine: 1.4, total: 3.1, paid: 3, profit: 0.1 });
  // = 200 back + 140 from the other player + 280 from your own 2 slips = 620 ETB; paid 600; profit +20 ETB
});

test("slip breakdown: one slip each, 2 players", () => {
  assert.deepEqual(slipBreakdown(1, 1, 2, 0.3), { stakeBack: 1, fromOthers: 0.7, fromMine: 0, total: 1.7, paid: 1, profit: 0.7 });
  assert.equal(slipBreakdown(1, 0, 2, 0.3), null);
});
