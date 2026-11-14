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

// ------------------------------------------------------------ NOWPayments
import { nowPaymentsAction, sortKeysDeep, verifyNowPaymentsSignature } from "../lib/crypto-pay";

test("nowpayments: IPN signature = HMAC-SHA512 of JSON with sorted keys (nested too)", () => {
  const body = { payment_status: "finished", payment_id: 5, fee: { serviceFee: 0, currency: "btc" }, order_id: "gs-dep-1", price_amount: 7.5 };
  const sorted = '{"fee":{"currency":"btc","serviceFee":0},"order_id":"gs-dep-1","payment_id":5,"payment_status":"finished","price_amount":7.5}';
  assert.equal(JSON.stringify(sortKeysDeep(body)), sorted);
  const sig = createHmac("sha512", "ipnsecret").update(sorted).digest("hex");
  assert.equal(verifyNowPaymentsSignature(body, sig, "ipnsecret"), true);
  assert.equal(verifyNowPaymentsSignature(body, sig.toUpperCase(), "ipnsecret"), true);
  assert.equal(verifyNowPaymentsSignature({ ...body, price_amount: 750 }, sig, "ipnsecret"), false); // changed amount
  assert.equal(verifyNowPaymentsSignature(body, sig, "wrong"), false);
  assert.equal(verifyNowPaymentsSignature(body, null, "ipnsecret"), false);
  assert.equal(verifyNowPaymentsSignature(body, sig, undefined), false);
});

test("nowpayments: only a finished, full, first payment adds Units", () => {
  const base = { payment_status: "finished", price_amount: 7.5, price_currency: "usd", pay_currency: "usdttrc20", parent_payment_id: null };
  assert.deepEqual(nowPaymentsAction(base, 7.5), { action: "credit" });
  assert.equal(nowPaymentsAction({ ...base, price_currency: "USD" }, 7.5).action, "credit");
  for (const s of ["waiting", "confirming", "confirmed", "sending"]) assert.equal(nowPaymentsAction({ ...base, payment_status: s }, 7.5).action, "wait");
  assert.equal(nowPaymentsAction({ ...base, payment_status: "expired" }, 7.5).action, "expire");
  assert.equal(nowPaymentsAction({ ...base, payment_status: "failed" }, 7.5).action, "expire");
  assert.equal(nowPaymentsAction({ ...base, payment_status: "partially_paid", actually_paid: 5 }, 7.5).action, "review");
  assert.equal(nowPaymentsAction({ ...base, parent_payment_id: 123 }, 7.5).action, "review"); // repeated deposit
  assert.equal(nowPaymentsAction({ ...base, price_amount: 1 }, 7.5).action, "review"); // someone else's cheaper invoice
  assert.equal(nowPaymentsAction({ ...base, price_currency: "eur" }, 7.5).action, "review");
});
