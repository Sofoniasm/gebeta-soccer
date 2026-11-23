import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appLoginCallback,
  appLoginStartParam,
  codeChoices,
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
