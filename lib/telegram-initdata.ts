/**
 * Verify Telegram Mini App `initData` (server only).
 *
 * Telegram signs the data it hands to the Mini App:
 *   secret_key       = HMAC_SHA256(key = "WebAppData", data = BOT_TOKEN)
 *   data_check_string = every field except `hash`, as "key=value",
 *                       sorted by key, joined with "\n"
 *   hash             = hex(HMAC_SHA256(key = secret_key, data = data_check_string))
 * If our hash matches theirs, the data really came from Telegram for our bot
 * and the user inside it is genuine. `auth_date` stops old data being replayed.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
}

export type InitDataResult =
  | { ok: true; user: TelegramUser; authDate: Date }
  | { ok: false; reason: "missing" | "bad_hash" | "expired" | "no_user" };

export function verifyInitData(
  initData: string,
  botToken: string,
  { maxAgeSeconds = 24 * 3600, now = Date.now() }: { maxAgeSeconds?: number; now?: number } = {},
): InitDataResult {
  if (!initData || !botToken) return { ok: false, reason: "missing" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/.test(hash)) return { ok: false, reason: "bad_hash" };
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "bad_hash" };

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || authDate <= 0) return { ok: false, reason: "expired" };
  const ageSeconds = now / 1000 - authDate;
  if (ageSeconds > maxAgeSeconds || ageSeconds < -300) return { ok: false, reason: "expired" };

  try {
    const user = JSON.parse(params.get("user") ?? "null") as TelegramUser | null;
    if (!user || typeof user.id !== "number") return { ok: false, reason: "no_user" };
    return { ok: true, user, authDate: new Date(authDate * 1000) };
  } catch {
    return { ok: false, reason: "no_user" };
  }
}
