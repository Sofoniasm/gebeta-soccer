import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRoundAnnouncement, channelChatId, DEFAULT_TELEGRAM_CHANNEL } from "../lib/channel-post";

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
  assert.ok(p.text.includes("1 Units (200 ETB)"));
  const row = p.reply_markup.inline_keyboard[0];
  assert.equal(row[0].url, "https://gebetasoccer.com/dashboard?round=42");
  assert.equal(row[1].url, "https://t.me/GebetaSoccerbot?start=play");
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
