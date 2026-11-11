/**
 * Payment & contact details shown to players.
 * Set these in Vercel → Settings → Environment Variables (then redeploy):
 *   NEXT_PUBLIC_TELEBIRR_NUMBER   e.g. 0911 223 344
 *   NEXT_PUBLIC_TELEBIRR_NAME     name shown on the Telebirr account
 *   NEXT_PUBLIC_TELEGRAM_URL      e.g. https://t.me/gebetasoccer
 */
export const TELEBIRR_NUMBER = process.env.NEXT_PUBLIC_TELEBIRR_NUMBER ?? "";
export const TELEBIRR_NAME = process.env.NEXT_PUBLIC_TELEBIRR_NAME ?? "GebetaSoccer";
export const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_URL ?? "";
