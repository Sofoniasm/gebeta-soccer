/**
 * "Log in with the Telegram app" (phone browsers): pure helpers shared by the website routes and the bot webhook.
 * Flow: the login page gets a one-time token + a 2-digit code -> the player opens the bot through
 * t.me/<bot>?start=lg_<token> -> the bot shows three numbers and the player taps the one shown on the website
 * -> the page (polling) is signed in. Only the server touches the table; tokens are stored hashed (5 minutes).
 */
import { createHash, randomBytes, randomInt } from "node:crypto";

export const APP_LOGIN_COOKIE = "tg_app_login";
export const APP_LOGIN_TTL_SECONDS = 300;

/** A fresh random token (what the browser keeps in a cookie and puts in the Telegram link). */
export const newAppLoginToken = () => randomBytes(18).toString("base64url");
export const hashAppLoginToken = (raw: string) => createHash("sha256").update(raw).digest("hex");
/** The text after /start in the t.me link. */
export const appLoginStartParam = (raw: string) => `lg_${raw}`;
/** "lg_<token>" -> token, or null when the /start text is something else. */
export function parseAppLoginStart(param: string | undefined | null): string | null {
  const m = /^lg_([A-Za-z0-9_-]{20,40})$/.exec(param ?? "");
  return m ? m[1] : null;
}

/** A 2-digit number (10 to 99). */
export const newAppLoginCode = () => String(randomInt(10, 100));

/** The three numbers the bot shows: the right one and two different decoys, in random order. */
export function codeChoices(code: string, rnd: () => number = Math.random): string[] {
  const set = new Set<string>([code]);
  for (let i = 0; set.size < 3 && i < 50; i++) set.add(String(10 + Math.floor(rnd() * 90)));
  for (let n = 10; set.size < 3; n++) set.add(String(n)); // never loops forever, whatever rnd gives
  return [...set].sort(() => rnd() - 0.5);
}

/** callback_data of a button: lg:<row id>:<code> (well under Telegram's 64 byte limit). */
export const appLoginCallback = (id: number, code: string) => `lg:${id}:${code}`;
export function parseAppLoginCallback(data: string | undefined | null): { id: number; code: string } | null {
  const m = /^lg:(\d{1,12}):(\d{2})$/.exec(data ?? "");
  return m ? { id: Number(m[1]), code: m[2] } : null;
}

/** What a tap on one of the three numbers means (pure, so it can be tested without Telegram). */
export function decideTap(
  row: { status: string; code: string; telegram_user_id: number | string | null; expires_at: string } | null,
  tap: { fromId: number; code: string },
  now: number = Date.now(),
): "approve" | "deny" | "invalid" {
  if (!row || row.status !== "pending") return "invalid";
  if (Number(row.telegram_user_id) !== tap.fromId) return "invalid"; // only the Telegram that opened this login may answer
  if (new Date(row.expires_at).getTime() < now) return "invalid";
  return tap.code === row.code ? "approve" : "deny";
}

/** A 6-digit code for the fallback "/login 123456" message to the bot. */
export const newShortCode = () => String(randomInt(100000, 1000000));
/** "/login 123456" (also "/login@Bot 123456") -> "123456", or null. */
export function parseLoginCommand(text: string | undefined | null): string | null {
  const m = /^\/login(?:@\w+)?\s+(\d{6})\s*$/i.exec((text ?? "").trim());
  return m ? m[1] : null;
}
