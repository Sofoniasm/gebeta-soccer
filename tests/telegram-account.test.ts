import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanUsername, placeholderEmail, usernameBase, usernameCandidates } from "../lib/telegram-account";

test("telegram username: letters, digits and _ only, 24 characters at most", () => {
  assert.equal(cleanUsername("Hermela Gossa"), "Hermela_Gossa");
  assert.equal(cleanUsername("  --Abebe!!  "), "Abebe");
  assert.equal(cleanUsername("a".repeat(40)).length, 24);
  assert.equal(cleanUsername("ሄርሜላ"), ""); // Amharic letters are not allowed in usernames
  assert.equal(cleanUsername("José"), "Jose");
});

test("telegram username: @handle first, then the name, then player_1234", () => {
  assert.equal(usernameBase({ username: "hermi_94", first_name: "Hermela" }, "+251912145941"), "hermi_94");
  assert.equal(usernameBase({ first_name: "Hermela", last_name: "Gossa" }, "+251912145941"), "Hermela_Gossa");
  assert.equal(usernameBase({ first_name: "ሄርሜላ" }, "+251912145941"), "player_5941"); // Amharic only
  assert.equal(usernameBase({ username: "ab", first_name: "Al" }, "+251912145941"), "player_5941"); // too short
});

test("telegram username: if the name is taken, 3 random digits are added (stays within 24 characters)", () => {
  const c = usernameCandidates("x".repeat(24), () => 0.5);
  assert.equal(c[0], "x".repeat(24));
  assert.equal(c.length, 6);
  for (const n of c.slice(1)) {
    assert.ok(n.length <= 24);
    assert.match(n, /^x+\d{3}$/);
  }
});

test("the hidden login address matches the website sign-up (a .invalid address can never receive mail)", () => {
  assert.equal(placeholderEmail("+251912145941"), "p251912145941@phone.gebeta-soccer.invalid");
});
