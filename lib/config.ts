/**
 * Where players send deposits and get help (Telegram admin).
 * Can be overridden with NEXT_PUBLIC_TELEGRAM_URL in Vercel.
 */
export const TELEGRAM_URL = process.env.NEXT_PUBLIC_TELEGRAM_URL || "https://t.me/sofoniasmengistu";
export const TELEGRAM_HANDLE = "@" + TELEGRAM_URL.replace(/^https?:\/\/t\.me\//, "").replace(/\/$/, "");
