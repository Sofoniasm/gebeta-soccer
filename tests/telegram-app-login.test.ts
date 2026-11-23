import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appLoginCallback,
  appLoginStartParam,
  codeChoices,
  decideTap,
  hashAppLoginToken,
  newAppLoginCode,
  newAppLoginToken,
  parseAppLoginCallback,
  parseAppLoginStart,
} from "../lib/telegram-app-login";

test("app login: token round trip through the t.me start parameter", () => {
  const raw = newAppLoginToken();
  assert.match(raw, /^[A-Za-z0-9_-]{24}$/);
  const param = appLoginStartParam(raw);
  assert.ok(param.length <= 64, "Telegram allows 64 characters after ?start=");
  assert.equal(parseAppLoginStart(param), raw);
  assert.equal(parseAppLoginStart("c_GC-ABC123"), null); // other start links are not logins
  assert.equal(parseAppLoginStart("lg_short"), null);
  assert.equal(parseAppLoginStart(undefined), null);
  assert.notEqual(newAppLoginToken(), newAppLoginToken());
});

test("app login: the stored value is a hash, not the token", () => {
  const raw = newAppLoginToken();
  const h = hashAppLoginToken(raw);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes(raw));
  assert.equal(h, hashAppLoginToken(raw));
});

test("app login: the code is 2 digits and the bot shows it among 3 different numbers", () => {
  for (let i = 0; i < 50; i++) {
    const code = newAppLoginCode();
    assert.match(code, /^[1-9][0-9]$/);
    const c = codeChoices(code);
    assert.equal(c.length, 3);
    assert.equal(new Set(c).size, 3);
    assert.ok(c.includes(code));
  }
  // deterministic random source still gives 3 different numbers
  assert.equal(new Set(codeChoices("42", () => 0.1)).size, 3);
});

test("app login: button data round trip and refusal of anything else", () => {
  assert.equal(appLoginCallback(12, "47"), "lg:12:47");
  assert.deepEqual(parseAppLoginCallback("lg:12:47"), { id: 12, code: "47" });
  assert.equal(parseAppLoginCallback("lg:12:4"), null);
  assert.equal(parseAppLoginCallback("lg:x:47"), null);
  assert.equal(parseAppLoginCallback("something"), null);
  assert.equal(parseAppLoginCallback(undefined), null);
});

test("app login: a tap approves only the right number from the right Telegram, in time, once", () => {
  const now = Date.parse("2026-11-23T10:00:00Z");
  const row = { status: "pending", code: "58", telegram_user_id: 777, expires_at: "2026-11-23T10:04:00Z" };
  assert.equal(decideTap(row, { fromId: 777, code: "58" }, now), "approve");
  assert.equal(decideTap(row, { fromId: 777, code: "12" }, now), "deny"); // wrong number cancels the login
  assert.equal(decideTap(row, { fromId: 999, code: "58" }, now), "invalid"); // another Telegram account cannot answer
  assert.equal(decideTap(row, { fromId: 777, code: "58" }, Date.parse("2026-11-23T10:05:00Z")), "invalid"); // expired
  assert.equal(decideTap({ ...row, status: "approved" }, { fromId: 777, code: "58" }, now), "invalid"); // already used
  assert.equal(decideTap({ ...row, status: "denied" }, { fromId: 777, code: "58" }, now), "invalid");
  assert.equal(decideTap({ ...row, telegram_user_id: null }, { fromId: 777, code: "58" }, now), "invalid"); // the bot never saw /start
  assert.equal(decideTap(null, { fromId: 777, code: "58" }, now), "invalid");
});
