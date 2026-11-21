/**
 * Telegram is the proof: when a player shares their own phone number with the bot,
 * Telegram itself vouches that the number is theirs (the contact's user id must equal
 * the sender's id) and the signed login / Mini App data says which Telegram account it is.
 * So no password is needed to confirm an account or to make a new one.
 *
 *  - pure helpers (usernames from a Telegram profile) are tested in tests/telegram-account.test.ts
 *  - createTelegramAccount / confirmUnconfirmedAccount are server only
 */
import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { markPhoneVerified } from "@/lib/verification";

export interface TgUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

/** Same hidden login address the website sign-up uses for players without an email (".invalid" can never receive mail). */
export const placeholderEmail = (phone: string) => `p${phone.replace(/\D/g, "")}@phone.gebeta-soccer.invalid`;

/** Letters, digits and _ only (the site's username rule), at most 24 characters. */
export function cleanUsername(raw: string): string {
  return raw
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
}

/** A display name from the Telegram profile: @username, else the first/last name, else player_1234 (Amharic names have no ASCII letters). */
export function usernameBase(u: Pick<TgUser, "username" | "first_name" | "last_name">, phone: string): string {
  const fromHandle = cleanUsername(u.username ?? "");
  if (fromHandle.length >= 3) return fromHandle;
  const fromName = cleanUsername([u.first_name, u.last_name].filter(Boolean).join("_"));
  if (fromName.length >= 3) return fromName;
  return `player_${phone.replace(/\D/g, "").slice(-4)}`;
}

/** The name first, then the name with 3 random digits, in case it is taken. */
export function usernameCandidates(base: string, rnd: () => number = Math.random): string[] {
  const out = [base];
  for (let i = 0; i < 5; i++) out.push(`${base.slice(0, 21)}${String(Math.floor(rnd() * 900) + 100)}`);
  return out;
}

const randomPassword = () => randomBytes(24).toString("base64url");

export type CreateResult = { ok: true; userId: string; username: string } | { ok: false; reason: "taken" | "failed" };

/** A brand-new player from Telegram: confirmed phone, linked Telegram, no password they know. Date of birth comes from the bot chat (or, from the Mini App, the app asks once). */
export async function createTelegramAccount(tg: TgUser, phone: string, dob?: string): Promise<CreateResult> {
  const admin = createAdminClient();
  const { data: other } = await admin.from("profiles").select("id").eq("telegram_user_id", tg.id).maybeSingle();
  if (other) return { ok: false, reason: "taken" };

  let username: string | null = null;
  for (const candidate of usernameCandidates(usernameBase(tg, phone))) {
    const { data, error } = await admin.rpc("check_signup_available", { p_username: candidate, p_phone: phone }).single();
    if (error) return { ok: false, reason: "failed" };
    const a = data as { username_taken: boolean; phone_taken: boolean };
    if (a.phone_taken) return { ok: false, reason: "taken" };
    if (!a.username_taken) {
      username = candidate;
      break;
    }
  }
  if (!username) return { ok: false, reason: "failed" };

  const { data: created, error } = await admin.auth.admin.createUser({
    email: placeholderEmail(phone),
    password: randomPassword(),
    email_confirm: true,
    // date_of_birth (already checked 18+) is saved with the account; without it the app asks once before playing
    user_metadata: { username, phone_number: phone, ...(dob ? { date_of_birth: dob } : {}) },
  });
  if (error || !created.user) return { ok: false, reason: "failed" };
  await markPhoneVerified(created.user.id, tg.id);
  return { ok: true, userId: created.user.id, username };
}

/**
 * An account made on the website with this phone number was never confirmed. The person who just proved
 * the number with Telegram is its real owner: confirm and link it, wipe the old password and end the old
 * sessions (so nobody who typed this number into the sign-up form first can get in).
 * They can set a new password any time (Profile, or "Forgot password" with a Telegram code).
 */
export async function confirmUnconfirmedAccount(userId: string, telegramUserId: number): Promise<void> {
  const admin = createAdminClient();
  await admin.auth.admin.updateUserById(userId, { password: randomPassword() });
  const { error } = await admin.rpc("revoke_user_sessions", { p_user: userId });
  if (error) console.error("revoke_user_sessions:", error.message); // 0054 not run yet: the password is still wiped
  await markPhoneVerified(userId, telegramUserId);
}
