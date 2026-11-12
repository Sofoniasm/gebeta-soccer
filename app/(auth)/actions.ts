"use server";

import { dobError } from "@/lib/age";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { checkLoginLock, clientIp, loginKey, recordLoginAttempt } from "@/lib/login-lock";
import { deliverResetCode, resetThrottled, verifyResetCode } from "@/lib/password-reset";
import { PAGES } from "@/lib/i18n/pages";
import { pushNotifications } from "@/lib/notify";

export type AuthState = { error?: string; success?: string } | undefined;

/** Hidden login address for players who don't give an email.
 *  ".invalid" can never receive mail (RFC 2606), so it can't be hijacked. */
const PLACEHOLDER_DOMAIN = "phone.gebeta-soccer.invalid";
const placeholderEmail = (phone: string) => `p${phone.replace(/\D/g, "")}@${PLACEHOLDER_DOMAIN}`;

/** Only allow redirects inside our own site. */
function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

/**
 * Find the Supabase login email for a username, phone number or email.
 * Runs on the server only — the email is never sent to the browser.
 */
async function resolveLoginEmail(identifier: string): Promise<string | null> {
  const id = identifier.trim();
  if (!id) return null;
  if (id.includes("@")) return id.toLowerCase();

  const admin = createAdminClient();
  const phone = normalizeEthiopianPhone(id);

  const query = admin.from("profiles").select("id");
  const { data: profile } = phone
    ? await query.eq("phone_number", phone).maybeSingle()
    : await query.ilike("username", id.replace(/[%_\\]/g, "\\$&")).maybeSingle();
  if (!profile) return null;

  const { data } = await admin.auth.admin.getUserById(profile.id);
  return data.user?.email ?? null;
}

// ---------------------------------------------------------------- login
export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "");
  const password = String(formData.get("password") ?? "");
  const tt = PAGES[formData.get("lang") === "am" ? "am" : "en"].auth;
  if (!identifier.trim() || !password) return { error: tt.errEnterBoth };

  // Brute-force protection: 5 wrong passwords per login, or too many from one
  // network, locks it for 15 minutes. Checked before the password is tried.
  const key = loginKey(identifier);
  const ip = await clientIp();
  const locked = await checkLoginLock(key, ip);
  if (locked) return { error: tt === PAGES.en.auth ? locked : tt.errLocked };

  const email = await resolveLoginEmail(identifier);
  // Same message whether the user exists or not — don't reveal who is registered.
  // Unknown logins count as wrong tries too, so guessing usernames is throttled.
  if (!email) {
    await recordLoginAttempt(key, ip, false);
    return { error: tt.errWrong };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const m = error.message.toLowerCase();
    if (m.includes("email not confirmed")) return { error: "Please confirm your email first — check your inbox (and spam)." };
    if (m.includes("disabled")) return { error: "Logins are temporarily unavailable. Please try again soon." };
    await recordLoginAttempt(key, ip, false);
    return { error: tt.errWrong };
  }
  await recordLoginAttempt(key, ip, true);
  redirect(safeNext(formData.get("next")));
}

// ------------------------------------------------------------- register
export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  let username = String(formData.get("username") ?? "").trim();
  const emailInput = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");
  const dob = String(formData.get("date_of_birth") ?? "").trim();
  const tr = PAGES[formData.get("lang") === "am" ? "am" : "en"].auth;

  const phone = normalizeEthiopianPhone(phoneRaw);
  if (!phone) return { error: tr.errPhone };
  if (password.length < 8) return { error: tr.resetTooShort };
  if (username && !/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return { error: tr.errName };
  }
  if (emailInput && !/^\S+@\S+\.\S+$/.test(emailInput)) return { error: "That email doesn't look right (or leave it empty)." };
  const dobProblem = dobError(dob);
  if (dobProblem) return { error: dobProblem };
  if (formData.get("age_ok") !== "on") {
    return { error: tr.errAge };
  }

  const supabase = await createClient();

  // No display name given → make one like "player_3344" (unique).
  const userChose = Boolean(username);
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = userChose ? username : `player_${phone.slice(-4)}${attempt ? Math.floor(Math.random() * 90 + 10) : ""}`;
    // Server-only check (the browser can't ask "is this phone registered?").
    const { data: avail, error: availError } = await createAdminClient()
      .rpc("check_signup_available", { p_username: candidate, p_phone: phone })
      .single();
    if (availError) return { error: "Could not check availability. Please try again." };
    const a = avail as { username_taken: boolean; phone_taken: boolean };
    if (a.phone_taken) return { error: tr.errPhoneTaken };
    if (!a.username_taken) { username = candidate; break; }
    if (userChose) return { error: tr.errNameTaken };
    if (attempt === 5) return { error: "Could not create a display name. Please type one." };
  }

  // Create the account on the server with the secret key. This works no matter
  // how Supabase's "Allow sign-ups" / "Confirm email" switches are set, and the
  // account is active immediately.
  const loginEmail = emailInput || placeholderEmail(phone);
  const { error: createError } = await createAdminClient().auth.admin.createUser({
    email: loginEmail,
    password,
    email_confirm: true,
    user_metadata: { username, phone_number: phone, date_of_birth: dob, age_confirmed_18: true, terms_accepted_at: new Date().toISOString() },
  });

  if (createError) {
    const m = createError.message.toLowerCase();
    if (m.includes("already") && m.includes("registered")) {
      return { error: emailInput ? "That email is already registered. Try logging in." : "That phone number is already registered." };
    }
    if (m.includes("18 or older")) return { error: "You must be 18 or older to play GebetaSoccer." };
    if (m.includes("database error")) return { error: "That username or phone number is already taken." };
    if (m.includes("password")) return { error: "Please choose a stronger password (at least 8 characters)." };
    return { error: tr.errGeneric };
  }

  // Sign the new player in straight away.
  const { error: signInError } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
  if (signInError) {
    if (signInError.message.toLowerCase().includes("disabled")) {
      return { error: "Account created, but logins are switched off in Supabase (Email provider). Ask the admin to enable it." };
    }
    return { success: "Account created. Log in with your phone number to confirm it." };
  }
  const next = safeNext(formData.get("next"));
  redirect(next !== "/dashboard" ? `/verify?next=${encodeURIComponent(next)}` : "/verify");
}

// -------------------------------------------------------------- sign out
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

// -------------------------------------------------------- forgot password
const langOf = (formData: FormData) => (formData.get("lang") === "am" ? "am" : "en");

export type ForgotState = { stage: "phone" | "code"; phone?: string; error?: string; info?: string } | undefined;

/** Step 1: send a 6-digit code to the player's Telegram (or SMS). Same answer whether the number exists or not. */
export async function requestResetCode(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const t = PAGES[langOf(formData)].auth;
  const phone = normalizeEthiopianPhone(String(formData.get("phone") ?? ""));
  if (!phone) return { stage: "phone", error: t.forgotBadPhone };
  const ip = await clientIp();
  const { data: p } = await createAdminClient().from("profiles").select("id").eq("phone_number", phone).maybeSingle();
  if (await resetThrottled(p?.id ?? null, ip)) return { stage: "phone", phone, error: t.tooManyRequests };
  if (p) await deliverResetCode(p.id, ip);
  return { stage: "code", phone, info: t.codeSent(phone) };
}

/** Step 2: check the code and set the new password. Wrong codes are rejected (5 tries max). */
export async function confirmResetCode(prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const t = PAGES[langOf(formData)].auth;
  const phone = normalizeEthiopianPhone(String(formData.get("phone") ?? ""));
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const keep = { stage: "code" as const, phone: phone ?? undefined, info: prev?.info };
  if (!phone) return { stage: "phone", error: t.forgotBadPhone };
  if (password.length < 8) return { ...keep, error: t.resetTooShort };
  if (password !== confirm) return { ...keep, error: t.resetMismatch };

  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("id, username, phone_number, email").eq("phone_number", phone).maybeSingle();
  const check = await verifyResetCode(p?.id ?? null, code);
  if (!check.ok) {
    const error = check.reason === "wrong" ? (check.triesLeft ? t.wrongCode(check.triesLeft) : t.codeExpired) : check.reason === "locked" ? t.codeLocked : t.codeExpired;
    return { ...keep, error };
  }

  const { error } = await admin.auth.admin.updateUserById(check.userId, { password });
  if (error) return { ...keep, error: error.message.toLowerCase().includes("password") ? t.resetTooShort : t.resetFailed };
  await admin.from("password_resets").update({ used_at: new Date().toISOString(), outcome: "changed" }).eq("id", check.resetId);

  // Unlock the login (wrong-password lock), tell the player and the admins.
  for (const id of [p?.phone_number, p?.username, p?.email].filter(Boolean) as string[]) {
    await admin.rpc("clear_login_lock", { p_key: loginKey(id) });
  }
  await admin.from("notifications").insert({
    user_id: check.userId,
    kind: "security",
    title: "🔑 Password changed",
    body: "Your GebetaSoccer password was just changed with a Telegram code. If this wasn't you, contact support on Telegram right away.",
    link: "/profile",
    push: true,
  });
  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  if (admins?.length) {
    await admin.from("notifications").insert(
      admins.map((a: { id: string }) => ({
        user_id: a.id,
        kind: "admin",
        title: "🔑 Password reset",
        body: `${p?.username ?? "A player"} (${p?.phone_number ?? "no phone"}) reset their password with a Telegram code.`,
        link: `/admin/players/${check.userId}`,
        push: false,
      })),
    );
  }
  await pushNotifications([check.userId]);
  redirect("/login?reset=1");
}
