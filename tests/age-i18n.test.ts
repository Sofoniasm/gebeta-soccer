import { test } from "node:test";
import assert from "node:assert/strict";
import { dobError, latestAdultBirthDate } from "../lib/age";
import { isTranslatable, localPath, stripLang } from "../lib/i18n";

test("age: 18+ only, counted in Ethiopia time", () => {
  const now = new Date("2026-11-12T08:00:00Z"); // 11:00 in Addis
  assert.equal(latestAdultBirthDate(now), "2008-11-12");
  assert.equal(dobError("2008-11-12", now), null); // 18 today
  assert.match(dobError("2008-11-13", now) ?? "", /18 or older/); // 18 tomorrow
  assert.match(dobError("2015-01-01", now) ?? "", /18 or older/);
  assert.match(dobError("2001-02-30", now) ?? "", /isn't valid/);
  assert.match(dobError("", now) ?? "", /date of birth/);
  assert.match(dobError("1850-01-01", now) ?? "", /isn't valid/);
});

test("age: late evening in Addis is already the next day", () => {
  const now = new Date("2026-11-11T22:30:00Z"); // 01:30 on 12 Nov in Addis
  assert.equal(latestAdultBirthDate(now), "2008-11-12");
});

test("i18n: Amharic URLs only for translated pages", () => {
  assert.equal(localPath("/", "am"), "/am");
  assert.equal(localPath("/how-to-play", "am"), "/am/how-to-play");
  assert.equal(localPath("/predictions/arsenal-vs-chelsea-12", "am"), "/am/predictions/arsenal-vs-chelsea-12");
  assert.equal(localPath("/wallet", "am"), "/wallet");
  assert.equal(localPath("/how-to-play", "en"), "/how-to-play");
  assert.equal(stripLang("/am"), "/");
  assert.equal(stripLang("/am/terms"), "/terms");
  assert.equal(stripLang("/amazing"), "/amazing");
  assert.equal(isTranslatable("/news"), true);
  assert.equal(isTranslatable("/dashboard"), false);
});
