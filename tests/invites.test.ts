import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPhone, inviteError, inviteStatusText, inviteSummary, parseInvitePhones } from "../lib/invites";

test("invite phones: one per line or comma, spaces inside a number are fine, normalised and de-duplicated", () => {
  const r = parseInvitePhones("0911 223 344\n+251922334455, 0911223344 ; 922 111 222");
  assert.deepEqual(r.phones, ["+251911223344", "+251922334455", "+251922111222"]);
  assert.deepEqual(r.bad, []);
});

test("invite phones: bad numbers are reported, not silently dropped", () => {
  const r = parseInvitePhones("0911223344\n12345\nhello, 0811223344");
  assert.deepEqual(r.phones, ["+251911223344"]);
  assert.deepEqual(r.bad, ["12345", "hello", "0811223344"]);
  assert.deepEqual(parseInvitePhones("  \n , ").phones, []);
});

test("invite phones: formatted for people", () => {
  assert.equal(formatPhone("+251911223344"), "+251 91 122 3344");
  assert.equal(formatPhone("weird"), "weird");
});

test("invite results: plain words for every status", () => {
  for (const s of ["notified", "waiting_verify", "not_on_app", "already_in", "already_invited", "self", "invalid"]) {
    assert.notEqual(inviteStatusText(s), s);
  }
  assert.match(inviteStatusText("not_on_app"), /send them the link/i);
});

test("invite summary counts who was told and who needs the link", () => {
  const s = inviteSummary([
    { phone: "+251911000001", status: "notified" },
    { phone: "+251911000002", status: "waiting_verify" },
    { phone: "+251911000003", status: "not_on_app" },
    { phone: "+251911000004", status: "already_in" },
  ]);
  assert.match(s, /2 players invited/);
  assert.match(s, /1 not on GebetaSoccer yet/);
  assert.match(s, /1 skipped/);
  assert.equal(inviteSummary([]), "Nothing to send.");
});

test("invite errors are friendly", () => {
  assert.match(inviteError("only the creator can invite"), /Only the person who made/);
  assert.match(inviteError("challenge closed"), /closed/);
  assert.match(inviteError("invite limit reached for today"), /tomorrow/);
  assert.match(inviteError("boom"), /Could not send/);
});
