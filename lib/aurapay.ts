/**
 * AuraPay Global merchant API (server only). Docs: https://docs.aurapayglobal.com
 * Env (Vercel → Settings → Environment Variables):
 *   AURAPAY_API_KEY          apk_live_… (or apk_test_… while testing)
 *   AURAPAY_WEBHOOK_SECRET   the webhook secret set when the API key was made
 * Webhook URL to give AuraPay: <site>/api/aurapay/webhook
 */
import type { CryptoChain } from "./crypto-pay";

const API = "https://api.aurapayglobal.com/api/v1";

export const cryptoEnabled = () => Boolean(process.env.AURAPAY_API_KEY && process.env.AURAPAY_WEBHOOK_SECRET);

export interface Invoice {
  reference: string; // PR-XXXXXX
  checkoutUrl: string;
}

/** Create a USDT invoice. Throws with AuraPay's message on failure. */
export async function createUsdtInvoice(opts: {
  amountUsd: number;
  chain: CryptoChain;
  externalId: string;
  note: string;
  expiresInSeconds?: number;
}): Promise<Invoice> {
  const key = process.env.AURAPAY_API_KEY;
  if (!key) throw new Error("AURAPAY_API_KEY is not set");
  const body: Record<string, unknown> = {
    amount: opts.amountUsd,
    currency: "USDT",
    externalId: opts.externalId,
    note: opts.note,
    description: opts.note,
    expiresInSeconds: opts.expiresInSeconds ?? 3600,
  };
  if (opts.chain === "TRON") body.chain = "TRON"; // TON = leave chain out (AuraPay docs)
  const res = await fetch(`${API}/invoices`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.error ?? data.message ?? `AuraPay HTTP ${res.status}`));
  const reference = String(data.referenceCode ?? data.id ?? "");
  const checkoutUrl = String(data.checkoutUrl ?? data.payUrl ?? (reference ? `https://pay.aurapayglobal.com/pay/${reference}` : ""));
  if (!/^PR-[A-Za-z0-9]+$/.test(reference) || !checkoutUrl.startsWith("https://")) throw new Error("AuraPay sent an unexpected answer");
  return { reference, checkoutUrl };
}
