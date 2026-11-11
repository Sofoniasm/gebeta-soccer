import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyInitData } from "../lib/telegram-initdata";

const TOKEN = "123456789:TEST_TOKEN_for_unit_tests_only";
const NOW = 1_800_000_000_000;

/** Build initData exactly the way Telegram signs it. */
function sign(fields: Record<string, string>, token = TOKEN): string {
  const dcs = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const hash = createHmac("sha256", secret).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}
const user = JSON.stringify({ id: 4242, first_name: "Laki", username: "laki" });
const fresh = { auth_date: String(NOW / 1000 - 60), query_id: "AAHdF6IQAAAAAN0XohDhrOrc", user };

test("genuine Telegram data is accepted and the user is read", () => {
  const r = verifyInitData(sign(fresh), TOKEN, { now: NOW });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.user.id, 4242);
});

test("changing the user id (forgery) is rejected", () => {
  const forged = sign(fresh).replace(encodeURIComponent('"id":4242'), encodeURIComponent('"id":1'));
  assert.notEqual(forged, sign(fresh));
  assert.deepEqual(verifyInitData(forged, TOKEN, { now: NOW }), { ok: false, reason: "bad_hash" });
});

test("data signed for another bot is rejected", () => {
  const other = sign(fresh, "999:SOMEONE_ELSES_BOT");
  assert.deepEqual(verifyInitData(other, TOKEN, { now: NOW }), { ok: false, reason: "bad_hash" });
});

test("old data (replay) is rejected", () => {
  const old = sign({ ...fresh, auth_date: String(NOW / 1000 - 2 * 86400) });
  assert.deepEqual(verifyInitData(old, TOKEN, { now: NOW }), { ok: false, reason: "expired" });
});

test("missing hash / empty data / no user are rejected", () => {
  assert.equal(verifyInitData("", TOKEN).ok, false);
  assert.equal(verifyInitData(`auth_date=${NOW / 1000}&user=${encodeURIComponent(user)}`, TOKEN, { now: NOW }).ok, false);
  const noUser = sign({ auth_date: String(NOW / 1000), query_id: "x" });
  assert.deepEqual(verifyInitData(noUser, TOKEN, { now: NOW }), { ok: false, reason: "no_user" });
});
