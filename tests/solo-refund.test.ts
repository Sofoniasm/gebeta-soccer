import { test } from "node:test";
import assert from "node:assert/strict";
import {
  distinctPlayers,
  isSoloEntry,
  myPrize,
  myPrizeText,
  playersLabel,
  soloRefunds,
  SOLO_REFUND_MESSAGE,
  WAITING_MESSAGE,
} from "../lib/solo";
import { challengePrizeUnits } from "../lib/challenges";
import { settleRound } from "../lib/settlement";
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
  // Without the solo rule the scorer would pay the lone player 70% of their own money.
  const r = settleRound({ entrantIds: ["s1", "s2"], entryFeeUnits: 5, results: [], predictions: [] });
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

test("challenge, 2 players, 1,000 ETB stake, 10% fee", () => {
  const x = challengePrizeUnits(5, 2); // 9 Units = 1,800 ETB
  const p = myPrize(x, 5, 1);
  assert.deepEqual(p, { kind: "prize", winUnits: 9, ownUnits: 5, fromOthersUnits: 4 });
  assert.equal(myPrizeText(p), "You can win 1,800 ETB: your 1,000 ETB back + 800 ETB from other players");
});

test("league, 4 members, 5 Units fee, 30% house", () => {
  const prizeFund = Math.round(4 * 5 * 0.7 * 100) / 100; // 14 Units
  const p = myPrize(prizeFund, 5, 3);
  assert.equal(p.kind, "prize");
  if (p.kind !== "prize") return;
  assert.equal(p.winUnits, 14);
  assert.equal(p.ownUnits, 5);
  assert.equal(p.fromOthersUnits, 9);
  assert.equal(myPrizeText(p), "You can win 2,800 ETB: your 1,000 ETB back + 1,800 ETB from other players");
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

test("many own slips against one other: never claims money from others", () => {
  // 3 own slips + 1 other slip at 5 Units, 30% house: pot 20, prize 14, own 15.
  const p = myPrize(14, 15, 1);
  assert.equal(p.kind === "prize" && p.fromOthersUnits, -1);
  assert.equal(myPrizeText(p), "You can win 2,800 ETB (you put in 3,000 ETB)");
  assert.doesNotMatch(myPrizeText(p), /from other players/);
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
