/**
 * The site's public address, in ONE place. Set NEXT_PUBLIC_SITE_URL in Vercel
 * (e.g. https://gebetasoccer.com) and every link — invites, bot buttons,
 * Telegram notifications, the Mini App — follows it.
 */
const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/+$/, "");
const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;

export const SITE_URL = fromEnv || vercelProd || "https://gebeta-soccer.vercel.app";
/** "gebetasoccer.com" — for showing to people */
export const SITE_HOST = SITE_URL.replace(/^https?:\/\//, "");
