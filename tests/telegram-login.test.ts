import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { readPending, safeNextPath, signPending, verifyLoginWidget } from "../lib/telegram-login";

const TOKEN = "123456:TEST-bot-token";
const NOW = Date.UTC(2026, 10, 13, 12, 0, 0);
const authDate = String(Math.floor(NOW / 1000) - 60);

/** Sign widget fields exactly like Telegram does. */
function signed(fields: Record<string, string>, token = TOKEN): URLSearchParams {
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join("\n");
  const hash = createHmac("sha256", createHash("sha256").update(token).digest()).update(dcs).digest("hex");
  return new URLSearchParams({ ...fields, hash });
}
const abebe = { id: "777000111", first_name: "Abebe", username: "abebe_10", auth_date: authDate };

test("widget: genuine Telegram login is accepted", () => {
  const r = verifyLoginWidget(signed(abebe), TOKEN, { now: NOW });
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.user, { id: 777000111, first_name: "Abebe", username: "abebe_10" });
});

test("widget: our own `next` in the URL does not break the signature", () => {
  const q = signed(abebe);
  q.set("next", "/challenges/GC-ABC123");
  assert.equal(verifyLoginWidget(q, TOKEN, { now: NOW }).ok, true);
});

test("widget: changing the Telegram id (forgery) is rejected", () => {
  const q = signed(abebe);
  q.set("id", "1");
  assert.deepEqual(verifyLoginWidget(q, TOKEN, { now: NOW }), { ok: false, reason: "bad_hash" });
});

test("widget: data signed for another bot is rejected", () => {
  assert.deepEqual(verifyLoginWidget(signed(abebe, "999:other"), TOKEN, { now: NOW }), { ok: false, reason: "bad_hash" });
});

test("widget: Mini App style signature (WebAppData key) is not accepted here", () => {
  const dcs = Object.keys(abebe).sort().map((k) => `${k}=${abebe[k as keyof typeof abebe]}`).join("\n");
  const key = createHmac("sha256", "WebAppData").update(TOKEN).digest();
  const q = new URLSearchParams({ ...abebe, hash: createHmac("sha256", key).update(dcs).digest("hex") });
  assert.equal(verifyLoginWidget(q, TOKEN, { now: NOW }).ok, false);
});

test("widget: old login (replay) and missing data are rejected", () => {
  const old = { ...abebe, auth_date: String(Math.floor(NOW / 1000) - 2 * 3600) };
  assert.deepEqual(verifyLoginWidget(signed(old), TOKEN, { now: NOW }), { ok: false, reason: "expired" });
  assert.deepEqual(verifyLoginWidget(new URLSearchParams(), TOKEN, { now: NOW }), { ok: false, reason: "missing" });
  const noHash = signed(abebe);
  noHash.delete("hash");
  assert.deepEqual(verifyLoginWidget(noHash, TOKEN, { now: NOW }), { ok: false, reason: "bad_hash" });
});

test("pending sign-up cookie: round trip, tamper-proof, expires", () => {
  const v = signPending({ id: 777000111, first_name: "Abebe" }, TOKEN, NOW);
  assert.deepEqual(readPending(v, TOKEN, NOW + 60_000)?.id, 777000111);
  assert.equal(readPending(v, TOKEN, NOW + 31 * 60_000), null, "expired after 30 minutes");
  assert.equal(readPending(v, "999:other", NOW), null, "other bot token");

  const [payload, sig] = v.split(".");
  const forged = Buffer.from(JSON.stringify({ id: 1, exp: 9e9 })).toString("base64url");
  assert.equal(readPending(`${forged}.${sig}`, TOKEN, NOW), null, "changed payload");
  assert.equal(readPending(payload, TOKEN, NOW), null, "no signature");
  assert.equal(readPending(undefined, TOKEN, NOW), null);
});

test("redirects stay on our site", () => {
  assert.equal(safeNextPath("/challenges/GC-ABC123"), "/challenges/GC-ABC123");
  assert.equal(safeNextPath("//evil.example"), "/dashboard");
  assert.equal(safeNextPath("/\\evil.example"), "/dashboard");
  assert.equal(safeNextPath("https://evil.example"), "/dashboard");
  assert.equal(safeNextPath(null), "/dashboard");
});
