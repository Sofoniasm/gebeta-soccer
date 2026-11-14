import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { amountCovers, externalIdFor, isCryptoChain, timestampFresh, usdForUnits, verifyAuraPaySignature } from "../lib/crypto-pay";

test("crypto: price in USDT", () => {
  assert.equal(usdForUnits(5), 7.5); // default 1.5 USDT per Unit
  assert.equal(usdForUnits(500), 750);
  assert.equal(usdForUnits(5.5, 1.5), 8.25);
  assert.equal(usdForUnits(3, 1.333), 4); // 3.999 rounds UP to the cent
  assert.equal(usdForUnits(10, 0.1), 1); // no float noise (0.1 * 10)
});

test("crypto: paid amount must cover the invoice", () => {
  assert.equal(amountCovers(7.5, 7.5), true);
  assert.equal(amountCovers(7.495, 7.5), true); // 1 cent tolerance
  assert.equal(amountCovers(7.48, 7.5), false);
  assert.equal(amountCovers(7.500123, 7.5), true); // TRON payable amount with extra digits
  assert.equal(amountCovers(Number("abc"), 7.5), false);
});

test("crypto: webhook signature (sha256=HMAC of the raw body)", () => {
  const body = JSON.stringify({ event: "payment.confirmed", referenceCode: "PR-ABC123", amount: 7.5 });
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");
  assert.equal(verifyAuraPaySignature(body, sig, "s3cret"), true);
  assert.equal(verifyAuraPaySignature(body + " ", sig, "s3cret"), false); // body changed
  assert.equal(verifyAuraPaySignature(body, sig, "other"), false); // wrong secret
  assert.equal(verifyAuraPaySignature(body, sig.replace("sha256=", ""), "s3cret"), false);
  assert.equal(verifyAuraPaySignature(body, null, "s3cret"), false);
  assert.equal(verifyAuraPaySignature(body, sig, undefined), false); // secret not set = never trust
});

test("crypto: timestamp within 5 minutes", () => {
  const now = 1_800_000_000_000;
  assert.equal(timestampFresh(String(now - 60_000), now), true);
  assert.equal(timestampFresh(String(now + 60_000), now), true);
  assert.equal(timestampFresh(String(now - 6 * 60_000), now), false);
  assert.equal(timestampFresh(null, now), false);
  assert.equal(timestampFresh("abc", now), false);
});

test("crypto: networks and ids", () => {
  assert.equal(isCryptoChain("TRON"), true);
  assert.equal(isCryptoChain("TON"), true);
  assert.equal(isCryptoChain("EVM"), false);
  assert.equal(externalIdFor(42), "gs-dep-42");
});
