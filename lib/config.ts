/**
 * Where players send deposits and get help.
 * Set NEXT_PUBLIC_TELEGRAM_URL in Vercel (e.g. https://t.me/your_admin_username),
 * or replace the fallback below.
 */
export const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_URL ?? "https://t.me/";
export const TELEGRAM_HANDLE = TELEGRAM_URL.replace(/^https?:\/\/t\.me\//, "@").replace(/^@$/, "our Telegram admin");
