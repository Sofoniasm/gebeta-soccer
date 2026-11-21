/**
 * Sign-up inside the Telegram bot chat: pure helpers (the date of birth the player types).
 * The conversation itself is in lib/telegram-onboarding.ts (server only).
 */
import { dobError } from "@/lib/age";

export type DobResult = { ok: true; iso: string } | { ok: false; reason: "format" | "invalid" | "under18" };

const pad = (n: string, width: number) => n.padStart(width, "0");

/**
 * Day/month/year as people type it: 14/03/1995, 14-3-1995, 14.03.1995, also 1995-03-14.
 * Gregorian (European) calendar, like the website's date picker. Under 18 is refused.
 */
export function parseDob(text: string, now = new Date()): DobResult {
  const m = /^\s*(\d{1,4})\s*[/\-. ]\s*(\d{1,2})\s*[/\-. ]\s*(\d{1,4})\s*$/.exec(text);
  if (!m) return { ok: false, reason: "format" };
  let y: string, mo: string, d: string;
  if (m[1].length === 4) [y, mo, d] = [m[1], m[2], m[3]];
  else if (m[3].length === 4) [d, mo, y] = [m[1], m[2], m[3]];
  else return { ok: false, reason: "format" };
  if (d.length > 2) return { ok: false, reason: "format" };
  const iso = `${y}-${pad(mo, 2)}-${pad(d, 2)}`;
  const problem = dobError(iso, now);
  if (!problem) return { ok: true, iso };
  return { ok: false, reason: problem.includes("18 or older") ? "under18" : "invalid" };
}

/** Where to send the player to play once the account exists (only paths inside our own site). */
export function safeNextPath(p: string | null | undefined): string | null {
  return p && p.startsWith("/") && !p.startsWith("//") && p.length <= 200 ? p : null;
}

export const ONBOARDING_TEXT = {
  askDob:
    "👋 Welcome to <b>GebetaSoccer</b>! Let's set you up in two quick steps.\n\n1️⃣ GebetaSoccer is for players <b>18 or older</b>. Please type your <b>date of birth</b>: day/month/year, for example <code>14/03/1995</code>.",
  askPhone:
    "✅ Thanks!\n\n2️⃣ Now tap <b>Share my phone number</b> below. Telegram confirms the number is yours, so you don't need a password.",
  remindPhone: "Almost done: tap <b>📱 Share my phone number</b> at the bottom of the chat.",
  badFormat: "I couldn't read that date. Please type it like <code>14/03/1995</code> (day/month/year).",
  invalid: "That date doesn't look right. Please type your real date of birth like <code>14/03/1995</code>.",
  under18:
    "Sorry, GebetaSoccer is only for players aged <b>18 or older</b>, so I can't open an account for you.\n\nIf you typed the date by mistake, just send it again.",
} as const;
