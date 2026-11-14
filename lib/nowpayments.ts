/**
 * NOWPayments API (server only). Docs: https://documenter.getpostman.com/view/7907941/2s93JusNJt
 * Env (Vercel → Settings → Environment Variables):
 *   NOWPAYMENTS_API_KEY      Dashboard → Settings → Payments → API keys
 *   NOWPAYMENTS_IPN_SECRET   Dashboard → Settings → Payments → Instant payment notifications (shown once)
 *   NOWPAYMENTS_API_URL      optional, default https://api.nowpayments.io/v1 (their sandbox has its own URL)
 * The IPN (webhook) address is sent with every invoice: <site>/api/nowpayments/ipn
 */
import { SITE_URL } from "./site";

const api = () => (process.env.NOWPAYMENTS_API_URL?.trim() || "https://api.nowpayments.io/v1").replace(/\/+$/, "");

export const nowPaymentsEnabled = () => Boolean(process.env.NOWPAYMENTS_API_KEY && process.env.NOWPAYMENTS_IPN_SECRET);

/** Create a hosted invoice in USD; the player picks the coin (USDT, TON, BTC…) on NOWPayments' page and pays the fees. */
export async function createNowPaymentsInvoice(opts: { amountUsd: number; orderId: string; description: string }): Promise<{ id: string; url: string }> {
  const key = process.env.NOWPAYMENTS_API_KEY;
  if (!key) throw new Error("NOWPAYMENTS_API_KEY is not set");
  const res = await fetch(`${api()}/invoice`, {
    method: "POST",
    headers: { "x-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      price_amount: opts.amountUsd,
      price_currency: "usd",
      order_id: opts.orderId,
      order_description: opts.description,
      ipn_callback_url: `${SITE_URL}/api/nowpayments/ipn`,
      success_url: `${SITE_URL}/wallet?crypto=paid`,
      cancel_url: `${SITE_URL}/wallet`,
      is_fixed_rate: true,
      is_fee_paid_by_user: true, // the player pays the network/service fee, we get the full price
    }),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new Error(String(data.message ?? data.error ?? `NOWPayments HTTP ${res.status}`));
  const id = String(data.id ?? "");
  const url = String(data.invoice_url ?? "");
  if (!id || !url.startsWith("https://")) throw new Error("NOWPayments sent an unexpected answer");
  return { id, url };
}
