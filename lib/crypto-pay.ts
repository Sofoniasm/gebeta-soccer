/**
 * Crypto deposits (AuraPay Global, USDT). Pure functions only, so they can be
 * unit-tested. Network calls live in lib/aurapay.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Default price of 1 Unit in USDT (Admin → Site can change it). */
export const DEFAULT_USD_PER_UNIT = 1.5;
/** Networks we accept: USDT on TRON (TRC-20) and USDT on TON. */
export const CRYPTO_CHAINS = ["TRON", "TON"] as const;
export type CryptoChain = (typeof CRYPTO_CHAINS)[number];
export const isCryptoChain = (v: unknown): v is CryptoChain => CRYPTO_CHAINS.includes(v as CryptoChain);

/** Price in USDT for `units` Units, rounded up to the cent. */
export function usdForUnits(units: number, usdPerUnit = DEFAULT_USD_PER_UNIT): number {
  return Math.ceil(Math.round(units * usdPerUnit * 10000) / 100) / 100;
}

/** True when what was paid covers the invoice (1 cent tolerance). */
export const amountCovers = (paid: number, expected: number) => Number.isFinite(paid) && paid >= expected - 0.01;

/**
 * AuraPay webhook check: header X-AuraPay-Signature = "sha256=" + HMAC-SHA256(secret, raw body).
 * Constant-time compare. False for a missing header or secret.
 */
export function verifyAuraPaySignature(rawBody: string, header: string | null | undefined, secret: string | undefined): boolean {
  if (!header || !secret) return false;
  const want = "sha256=" + createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const got = header.trim();
  const a = Buffer.from(got);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** X-AuraPay-Timestamp (Unix ms) must be within 5 minutes of now. */
export function timestampFresh(header: string | null | undefined, now = Date.now(), maxDriftMs = 5 * 60_000): boolean {
  const t = Number(header);
  return Number.isFinite(t) && t > 0 && Math.abs(now - t) <= maxDriftMs;
}

/** Our id sent to AuraPay as externalId, and back. */
export const externalIdFor = (depositId: number) => `gs-dep-${depositId}`;

// ------------------------------------------------------------ NOWPayments
/** Sort object keys at every level (NOWPayments signs the JSON with sorted keys). */
export function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    return Object.keys(v as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, k) => {
        out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
        return out;
      }, {});
  }
  return v;
}

/** NOWPayments IPN check: x-nowpayments-sig = hex HMAC-SHA512(IPN secret, JSON with sorted keys). */
export function verifyNowPaymentsSignature(body: unknown, header: string | null | undefined, secret: string | undefined): boolean {
  if (!header || !secret || !body || typeof body !== "object") return false;
  const want = createHmac("sha512", secret.trim()).update(JSON.stringify(sortKeysDeep(body)), "utf8").digest("hex");
  const a = Buffer.from(header.trim().toLowerCase());
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface NowPaymentsIpn {
  payment_id?: number | string;
  parent_payment_id?: number | string | null;
  invoice_id?: number | string | null;
  payment_status?: string;
  price_amount?: number | string;
  price_currency?: string;
  pay_currency?: string;
  actually_paid?: number | string;
  order_id?: string | null;
}

/**
 * What to do with an IPN for our deposit (pure, so it can be tested):
 *   credit  — "finished", priced in USD, at least the invoice amount, and not a repeated deposit
 *   review  — money arrived but not cleanly (partially paid, repeated deposit, wrong price): admin checks
 *   expire  — failed / expired
 *   wait    — waiting / confirming / confirmed / sending: nothing to do yet
 */
export function nowPaymentsAction(ipn: NowPaymentsIpn, expectedUsd: number): { action: "credit" | "review" | "expire" | "wait"; reason?: string } {
  const st = String(ipn.payment_status ?? "");
  if (st === "failed" || st === "expired") return { action: "expire" };
  if (st === "partially_paid") return { action: "review", reason: `partially paid (${ipn.actually_paid ?? "?"} ${ipn.pay_currency ?? ""})`.trim() };
  if (st !== "finished") return { action: "wait" };
  if (ipn.parent_payment_id) return { action: "review", reason: "repeated deposit to an old address" };
  if (String(ipn.price_currency ?? "").toLowerCase() !== "usd") return { action: "review", reason: `price currency ${ipn.price_currency}` };
  if (!amountCovers(Number(ipn.price_amount), expectedUsd)) return { action: "review", reason: `price ${ipn.price_amount} USD, expected ${expectedUsd}` };
  return { action: "credit" };
}
