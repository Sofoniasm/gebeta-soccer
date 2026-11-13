/**
 * "Log in with Telegram" (website login widget) — server only, pure, testable.
 *
 * Telegram signs the data it sends back after the player confirms:
 *   secret_key        = SHA256(BOT_TOKEN)
 *   data_check_string = the widget's fields (not `hash`), "key=value",
 *                       sorted by key, joined with "\n"
 *   hash              = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
 * https://core.telegram.org/widgets/login#checking-authorization
 *
 * With data-request-access="write" the player also lets our bot message them,
 * so the bot can write first — no need to open the bot and press START.
 *
 * A brand-new player still has to fill in the sign-up form (phone, age, password).
 * Until then their Telegram identity waits in a short-lived signed cookie.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { TelegramUser } from "@/lib/telegram-initdata";

/** Only these fields are signed by Telegram; anything else in the URL (e.g. `next`) is ours. */
const WIDGET_FIELDS = ["id", "first_name", "last_name", "username", "photo_url", "auth_date"] as const;

export type WidgetResult =
  | { ok: true; user: TelegramUser; authDate: Date }
  | { ok: false; reason: "missing" | "bad_hash" | "expired" };

export function verifyLoginWidget(
  query: URLSearchParams | Record<string, string | undefined>,
  botToken: string,
  { maxAgeSeconds = 3600, now = Date.now() }: { maxAgeSeconds?: number; now?: number } = {},
): WidgetResult {
  const get = (k: string) => (query instanceof URLSearchParams ? query.get(k) : query[k]) ?? null;
  const hash = get("hash");
  if (!botToken || !get("id") || !get("auth_date")) return { ok: false, reason: "missing" };
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return { ok: false, reason: "bad_hash" };

  const dataCheckString = WIDGET_FIELDS.filter((k) => get(k) !== null)
    .map((k) => `${k}=${get(k)}`)
    .sort()
    .join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_hash" };

  const authDate = Number(get("auth_date"));
  const age = now / 1000 - authDate;
  if (!Number.isFinite(authDate) || authDate <= 0 || age > maxAgeSeconds || age < -300) return { ok: false, reason: "expired" };

  const id = Number(get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return { ok: false, reason: "missing" };
  const user: TelegramUser = { id };
  for (const k of ["first_name", "last_name", "username", "photo_url"] as const) {
    const v = get(k);
    if (v) user[k] = v;
  }
  return { ok: true, user, authDate: new Date(authDate * 1000) };
}

// ---- pending sign-up cookie -------------------------------------------------
export const PENDING_COOKIE = "gs_tg_signup";
export const PENDING_TTL_SECONDS = 30 * 60;

export interface PendingTelegram {
  id: number;
  first_name?: string;
  username?: string;
  exp: number; // unix seconds
}

const cookieKey = (botToken: string) => createHmac("sha256", "GebetaTelegramSignup").update(botToken).digest();
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64url");

/** "<payload>.<signature>" — the browser can read it but never change it. */
export function signPending(user: TelegramUser, botToken: string, now = Date.now()): string {
  const p: PendingTelegram = { id: user.id, exp: Math.floor(now / 1000) + PENDING_TTL_SECONDS };
  if (user.first_name) p.first_name = user.first_name.slice(0, 64);
  if (user.username) p.username = user.username.slice(0, 32);
  const payload = b64(JSON.stringify(p));
  const sig = createHmac("sha256", cookieKey(botToken)).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function readPending(value: string | undefined, botToken: string, now = Date.now()): PendingTelegram | null {
  if (!value || !botToken) return null;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return null;
  const expected = createHmac("sha256", cookieKey(botToken)).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PendingTelegram;
    if (!Number.isSafeInteger(p.id) || p.id <= 0 || !(p.exp > now / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

/** Only allow redirects inside our own site. */
export function safeNextPath(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/dashboard";
}
