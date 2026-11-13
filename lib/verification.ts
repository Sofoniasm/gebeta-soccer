/**
 * Phone verification logic (server only). Uses the secret-key client.
 */
import { createHash, randomBytes, randomInt } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, shareContactKeyboard } from "@/lib/telegram";

const TELEGRAM_TTL_MIN = 15;
const SMS_TTL_MIN = 10;
const SMS_MAX_ATTEMPTS = 5;
const SMS_MAX_PER_HOUR = 4;

const hashCode = (userId: string, code: string) =>
  createHash("sha256").update(`${userId}:${code}:${process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""}`).digest("hex");

/** Mark a player's phone as verified everywhere (profile + auth claims). */
export async function markPhoneVerified(userId: string, telegramUserId?: number) {
  const admin = createAdminClient();
  const update: Record<string, unknown> = { phone_verified_at: new Date().toISOString() };
  if (telegramUserId) update.telegram_user_id = telegramUserId;
  const { error } = await admin.from("profiles").update(update).eq("id", userId);
  if (error) throw new Error(error.message);
  const { data } = await admin.auth.admin.getUserById(userId);
  await admin.auth.admin.updateUserById(userId, {
    app_metadata: { ...(data.user?.app_metadata ?? {}), phone_verified: true },
  });
}

/** Start a Telegram verification and return the token for the t.me deep link. */
export async function createTelegramToken(userId: string): Promise<string> {
  const token = randomBytes(12).toString("hex"); // 24 chars, fits Telegram's 64-char start param
  const { error } = await createAdminClient().from("phone_verifications").insert({
    user_id: userId,
    method: "telegram",
    token,
    expires_at: new Date(Date.now() + TELEGRAM_TTL_MIN * 60_000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return token;
}

/** Create and store a 6-digit SMS code. Returns the code (to send) or an error. */
export async function createSmsCode(userId: string): Promise<{ code?: string; error?: string }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 60 * 60_000).toISOString();
  const { data: recent } = await admin
    .from("phone_verifications")
    .select("created_at")
    .eq("user_id", userId)
    .eq("method", "sms")
    .gte("created_at", since)
    .order("created_at", { ascending: false });
  const list = (recent ?? []) as { created_at: string }[];
  if (list.length >= SMS_MAX_PER_HOUR) return { error: "Too many codes requested. Try again in an hour." };
  if (list[0] && Date.now() - new Date(list[0].created_at).getTime() < 60_000) {
    return { error: "Please wait a minute before requesting another code." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error } = await admin.from("phone_verifications").insert({
    user_id: userId,
    method: "sms",
    code_hash: hashCode(userId, code),
    expires_at: new Date(Date.now() + SMS_TTL_MIN * 60_000).toISOString(),
  });
  if (error) return { error: "Could not create a code. Please try again." };
  return { code };
}

/** Check a submitted SMS code against the latest unexpired one. */
export async function checkSmsCode(userId: string, code: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("phone_verifications")
    .select("id, code_hash, attempts, expires_at, verified_at")
    .eq("user_id", userId)
    .eq("method", "sms")
    .is("verified_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = data as { id: number; code_hash: string; attempts: number; expires_at: string } | null;
  if (!row) return { ok: false, error: "Request a code first." };
  if (new Date(row.expires_at).getTime() < Date.now()) return { ok: false, error: "That code has expired. Request a new one." };
  if (row.attempts >= SMS_MAX_ATTEMPTS) return { ok: false, error: "Too many wrong attempts. Request a new code." };

  if (row.code_hash !== hashCode(userId, code)) {
    await admin.from("phone_verifications").update({ attempts: row.attempts + 1 }).eq("id", row.id);
    return { ok: false, error: "Wrong code. Please check the SMS and try again." };
  }
  await admin.from("phone_verifications").update({ verified_at: new Date().toISOString() }).eq("id", row.id);
  await markPhoneVerified(userId);
  return { ok: true };
}

/**
 * Telegram verification without pressing START: the player allowed our bot to
 * message them (Telegram login with "write" access), so the bot writes first
 * with the one-tap "Share my phone number" button. The webhook finishes it
 * exactly like the /start flow (the private chat id equals the Telegram user id).
 */
export async function startTelegramVerificationDm(
  userId: string,
  telegramUserId: number,
): Promise<"sent" | "taken" | "failed"> {
  const admin = createAdminClient();
  const { data: other } = await admin.from("profiles").select("id").eq("telegram_user_id", telegramUserId).neq("id", userId).maybeSingle();
  if (other) return "taken";
  const token = await createTelegramToken(userId);
  await admin.from("phone_verifications").update({ telegram_chat_id: telegramUserId }).eq("token", token);
  const res = await sendMessage(
    telegramUserId,
    "✅ Your GebetaSoccer account is ready.\n\nLast step: tap <b>Share my phone number</b> below to confirm it's your number. 👇",
    shareContactKeyboard,
  ).catch(() => ({ ok: false }));
  return res.ok ? "sent" : "failed";
}
