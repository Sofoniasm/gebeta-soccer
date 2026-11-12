/**
 * "Forgot password?" with a 6-digit code (server only).
 *  1. The player enters their phone number; the bot sends a code to the
 *     Telegram account linked to it (or SMS when that is switched on).
 *  2. The player types the code + a new password on the same page.
 * Codes: random, stored only as a SHA-256 fingerprint, valid 10 minutes,
 * single use, max 5 wrong tries. Requests are throttled per player and per
 * network. Every request (and whether the message arrived) is recorded so
 * the admin can see it; admins are notified when a password is changed.
 */
import { createHash, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, telegramEnabled } from "@/lib/telegram";
import { sendSms, smsEnabled } from "@/lib/sms";

export const CODE_TTL_MINUTES = 10;
export const MAX_CODE_TRIES = 5;
const PER_PLAYER_PER_HOUR = 3;
const PER_NETWORK_PER_HOUR = 10;

const hashCode = (userId: string, code: string) => createHash("sha256").update(`${userId}:${code}`).digest("hex");

/** New code for a player (older unused codes stop working). */
export async function createResetCode(userId: string, channel: "telegram" | "sms" | "admin", ip: string | null): Promise<{ code: string; id: number }> {
  const admin = createAdminClient();
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await admin.from("password_resets").update({ used_at: new Date().toISOString(), outcome: "replaced" }).eq("user_id", userId).is("used_at", null);
  const { data } = await admin
    .from("password_resets")
    .insert({
      user_id: userId,
      code_hash: hashCode(userId, code),
      channel,
      requested_ip: ip,
      expires_at: new Date(Date.now() + CODE_TTL_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single();
  return { code, id: data?.id ?? 0 };
}

/** Create a code and send it. Records what happened. Returns how it was sent, or the reason it wasn't. */
export async function deliverResetCode(userId: string, ip: string | null): Promise<{ via: "telegram" | "sms" | null; error?: string }> {
  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("username, phone_number, telegram_user_id").eq("id", userId).single();
  if (!p) return { via: null, error: "player not found" };
  const errors: string[] = [];

  if (p.telegram_user_id && telegramEnabled()) {
    const { code, id } = await createResetCode(userId, "telegram", ip);
    const res = await sendMessage(
      Number(p.telegram_user_id),
      `🔑 <b>GebetaSoccer password reset</b>\n\nYour reset code for <b>${p.username}</b> is:\n\n<b><code>${code}</code></b>\n\nType it on the website within ${CODE_TTL_MINUTES} minutes. Never share this code with anyone, not even someone saying they are GebetaSoccer staff.\n\nDidn't ask for it? Ignore this message; your password stays the same.`,
    );
    await admin.from("password_resets").update(res.ok ? { delivered: "telegram" } : { delivery_error: `Telegram: ${res.description ?? "failed"}` }).eq("id", id);
    if (res.ok) return { via: "telegram" };
    errors.push(`Telegram: ${res.description ?? "failed"}`);
  } else {
    errors.push(!p.telegram_user_id ? "no Telegram linked" : "Telegram bot not configured");
  }

  if (p.phone_number && smsEnabled()) {
    const { code, id } = await createResetCode(userId, "sms", ip);
    const r = await sendSms(p.phone_number, `GebetaSoccer reset code: ${code} (valid ${CODE_TTL_MINUTES} min). Never share it.`);
    await admin.from("password_resets").update(r.ok ? { delivered: "sms" } : { delivery_error: `SMS: ${r.error ?? "failed"}` }).eq("id", id);
    if (r.ok) return { via: "sms" };
    errors.push(`SMS: ${r.error ?? "failed"}`);
  }
  return { via: null, error: errors.join("; ") };
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

export type CodeCheck = { ok: true; userId: string; resetId: number } | { ok: false; reason: "wrong" | "expired" | "locked"; triesLeft?: number };

/** Check a code typed by the player. A wrong code uses up one of the 5 tries. */
export async function verifyResetCode(userId: string | null, code: string): Promise<CodeCheck> {
  if (!userId || !/^\d{6}$/.test(code)) return { ok: false, reason: "wrong" };
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("password_resets")
    .select("id, code_hash, attempts, expires_at, used_at, outcome")
    .eq("user_id", userId)
    .not("code_hash", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (r && (r.outcome === "locked" || r.attempts >= MAX_CODE_TRIES)) return { ok: false, reason: "locked" };
  if (!r || r.used_at || new Date(r.expires_at).getTime() < Date.now()) return { ok: false, reason: "expired" };
  if (r.code_hash !== hashCode(userId, code)) {
    const attempts = r.attempts + 1;
    await admin.from("password_resets").update({ attempts, ...(attempts >= MAX_CODE_TRIES ? { used_at: new Date().toISOString(), outcome: "locked" } : {}) }).eq("id", r.id);
    return attempts >= MAX_CODE_TRIES ? { ok: false, reason: "locked" } : { ok: false, reason: "wrong", triesLeft: MAX_CODE_TRIES - attempts };
  }
  return { ok: true, userId, resetId: r.id };
}
