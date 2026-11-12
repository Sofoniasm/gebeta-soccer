/**
 * "Forgot password?" (server only). The player gets a one-time link on the
 * Telegram account linked to their number (or by SMS when SMS is switched on).
 * Only a SHA-256 fingerprint of the token is stored; links expire after 30
 * minutes and work once. Requests are throttled per player and per network.
 */
import { createHash, randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, telegramEnabled } from "@/lib/telegram";
import { sendSms, smsEnabled } from "@/lib/sms";
import { SITE_URL } from "@/lib/site";

const TTL_MINUTES = 30;
const PER_PLAYER_PER_HOUR = 3;
const PER_NETWORK_PER_HOUR = 10;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** New one-time token for a player (any older unused links stop working). */
export async function createResetLink(userId: string, channel: "telegram" | "sms" | "admin", ip: string | null): Promise<string> {
  const admin = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  await admin.from("password_resets").update({ used_at: new Date().toISOString() }).eq("user_id", userId).is("used_at", null);
  await admin.from("password_resets").insert({
    user_id: userId,
    token_hash: hashToken(token),
    channel,
    requested_ip: ip,
    expires_at: new Date(Date.now() + TTL_MINUTES * 60_000).toISOString(),
  });
  return `${SITE_URL}/reset?t=${token}`;
}

/** Send the link the best way we can. Returns how it was sent (or null if we couldn't). */
export async function deliverResetLink(userId: string, ip: string | null): Promise<"telegram" | "sms" | null> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("username, phone_number, telegram_user_id").eq("id", userId).single();
  if (!p) return null;
  if (p.telegram_user_id && telegramEnabled()) {
    const link = await createResetLink(userId, "telegram", ip);
    const res = await sendMessage(
      Number(p.telegram_user_id),
      `🔑 <b>Reset your GebetaSoccer password</b>\n\nSomeone (hopefully you) asked to reset the password for <b>${p.username}</b>. Tap the button within ${TTL_MINUTES} minutes.\n\nDidn't ask? Ignore this message; your password stays the same.`,
      { reply_markup: { inline_keyboard: [[{ text: "Reset my password", url: link }]] } },
    );
    if (res.ok) return "telegram";
  }
  if (p.phone_number && smsEnabled()) {
    const link = await createResetLink(userId, "sms", ip);
    const r = await sendSms(p.phone_number, `GebetaSoccer: reset your password (valid ${TTL_MINUTES} min): ${link}`);
    if (r.ok) return "sms";
  }
  return null;
}

/** Too many requests? (per player and per network, last hour) */
export async function resetThrottled(userId: string | null, ip: string): Promise<boolean> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count: byIp } = await admin.from("password_resets").select("id", { count: "exact", head: true }).eq("requested_ip", ip).gte("created_at", since);
  if ((byIp ?? 0) >= PER_NETWORK_PER_HOUR) return true;
  if (!userId) return false;
  const { count: byUser } = await admin.from("password_resets").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
  return (byUser ?? 0) >= PER_PLAYER_PER_HOUR;
}

/** Check a token from a link. Returns the player id if it's valid, unused and not expired. */
export async function checkResetToken(token: string): Promise<{ userId: string; resetId: number } | null> {
  if (!/^[A-Za-z0-9_-]{30,80}$/.test(token)) return null;
  const { data } = await createAdminClient()
    .from("password_resets")
    .select("id, user_id, expires_at, used_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at).getTime() < Date.now()) return null;
  return { userId: data.user_id, resetId: data.id };
}
