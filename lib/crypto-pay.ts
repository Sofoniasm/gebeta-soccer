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
