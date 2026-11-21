import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoundAnnouncement, buildWinnersPost, channelChatId, DEFAULT_TELEGRAM_CHANNEL } from "../lib/channel-post";

test("channel: username forms all become @Name", () => {
  assert.equal(DEFAULT_TELEGRAM_CHANNEL, "@GebetaSoccerOfficial");
  assert.equal(channelChatId(undefined), "@GebetaSoccerOfficial");
  assert.equal(channelChatId(""), "@GebetaSoccerOfficial");
  assert.equal(channelChatId("  "), "@GebetaSoccerOfficial");
  assert.equal(channelChatId("MyChannel"), "@MyChannel");
  assert.equal(channelChatId("@MyChannel"), "@MyChannel");
  assert.equal(channelChatId("https://t.me/MyChannel"), "@MyChannel");
  assert.equal(channelChatId("https://t.me/MyChannel/"), "@MyChannel");
  assert.equal(channelChatId("-1001234567890"), "-1001234567890");
  assert.equal(channelChatId("https://t.me/+AbCdInvite"), "@GebetaSoccerOfficial"); // invite links can't be used
});

test("channel: round announcement text and buttons", () => {
  const p = buildRoundAnnouncement({
    roundId: 42,
    name: "Evening 10 · Thu 12 Nov",
    slot: "evening",
    matchCount: 10,
    lockAt: "2026-11-12T12:30:00Z", // 15:30 EAT
    feeUnits: 1,
    siteUrl: "https://gebetasoccer.com/",
    botUsername: "GebetaSoccerbot",
  });
  assert.ok(p.text.startsWith("🌇 "), "slot emoji first");
  assert.ok(p.text.includes("<b>Evening 10 · Thu 12 Nov</b>"));
  assert.ok(p.text.includes("10 matches"));
  assert.ok(p.text.includes("Thu 12 Nov, 15:30"), "lock time in Ethiopian time");
  assert.ok(p.text.includes("Entry: 1 Unit (200 ETB)"), "singular for 1 Unit");
  assert.ok(!p.text.includes("1 Units"));
  const row = p.reply_markup.inline_keyboard[0];
  assert.equal(row[0].url, "https://gebetasoccer.com/dashboard?round=42&new=1#slip");
  assert.match(row[1].url, /^https:\/\/t\.me\/GebetaSoccerbot\?start=r_\d+$/); // opens that round in the Mini App
  // Channels don't allow Mini App buttons: only plain url buttons.
  for (const b of row) assert.deepEqual(Object.keys(b).sort(), ["text", "url"]);
});

test("channel: night emoji, no bot button, HTML escaped, unknown slot", () => {
  const p = buildRoundAnnouncement({
    roundId: 7,
    name: "A <b> & C",
    slot: "night",
    matchCount: 10,
    lockAt: "2026-11-12T16:00:00Z",
    siteUrl: "https://x.test",
  });
  assert.ok(p.text.startsWith("🌙 "));
  assert.ok(p.text.includes("A &lt;b&gt; &amp; C"));
  assert.ok(!p.text.includes("Entry:"));
  assert.equal(p.reply_markup.inline_keyboard[0].length, 1);
  assert.ok(buildRoundAnnouncement({ roundId: 1, name: "x", slot: null, matchCount: 3, lockAt: "2026-11-12T16:00:00Z", siteUrl: "https://x.test" }).text.startsWith("⚽ "));
});

test("channel: winners post shows usernames and amounts, adds up a player's slips, hides nothing else", () => {
  const post = buildWinnersPost({
    roundName: "Evening 7 · Fri 13 Nov",
    winners: [
      { username: "abel", units: 2.1, rank: 1 },
      { username: "bini", units: 1, rank: 2 },
      { username: "abel", units: 0.9, rank: 3 }, // second winning slip of abel: added up
    ],
    poolUnits: 10,
    players: 7,
    siteUrl: "https://www.gebetasoccer.com/",
  })!;
  assert.match(post.text, /Evening 7 · Fri 13 Nov: results/);
  assert.match(post.text, /🥇 <b>abel<\/b> won 3 Units \(600 ETB\)/);
  assert.match(post.text, /🥈 <b>bini<\/b> won 1 Unit \(200 ETB\)/);
  assert.match(post.text, /Pool: 10 Units \(2,000 ETB\) · 7 players/);
  assert.equal(post.reply_markup.inline_keyboard[0][0].url, "https://www.gebetasoccer.com/dashboard");
  // names are escaped, and nobody won -> no post
  assert.match(buildWinnersPost({ roundName: "R", winners: [{ username: "a<b>", units: 1, rank: 1 }], poolUnits: 1, players: 2, siteUrl: "https://x" })!.text, /a&lt;b&gt;/);
  assert.equal(buildWinnersPost({ roundName: "R", winners: [], poolUnits: 5, players: 3, siteUrl: "https://x" }), null);
});

test("channel post: with a Mini App short name the Telegram button opens the app straight on the round", () => {
  const post = buildRoundAnnouncement({ roundId: 12, name: "Test", slot: "evening", matchCount: 10, lockAt: "2026-11-21T12:30:00Z", siteUrl: "https://www.gebetasoccer.com", botUsername: "GebetaSoccerbot", miniAppName: "play" });
  assert.equal(post.reply_markup.inline_keyboard[0][1].url, "https://t.me/GebetaSoccerbot/play?startapp=r_12");
});
