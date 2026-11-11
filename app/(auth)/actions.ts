"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEthiopianPhone } from "@/lib/phone";

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
  if (!identifier.trim() || !password) return { error: "Enter your username (or phone) and password." };

  const email = await resolveLoginEmail(identifier);
  // Same message whether the user exists or not — don't reveal who is registered.
  if (!email) return { error: "Wrong username/phone or password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: "Please confirm your email first — check your inbox (and spam)." };
    }
    return { error: "Wrong username/phone or password." };
  }
  redirect(safeNext(formData.get("next")));
}

// ------------------------------------------------------------- register
export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim();
  const emailInput = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return { error: "Username: 3–24 letters, numbers or _ (no spaces)." };
  }
  const phone = normalizeEthiopianPhone(phoneRaw);
  if (!phone) return { error: "Enter a valid Ethiopian mobile number, e.g. 0911 223 344." };
  if (emailInput && !/^\S+@\S+\.\S+$/.test(emailInput)) return { error: "That email doesn't look right (or leave it empty)." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();

  const { data: avail, error: availError } = await supabase
    .rpc("check_signup_available", { p_username: username, p_phone: phone })
    .single();
  if (availError) return { error: "Could not check availability. Please try again." };
  const a = avail as { username_taken: boolean; phone_taken: boolean };
  if (a.username_taken) return { error: "That username is taken." };
  if (a.phone_taken) return { error: "That phone number is already registered." };

  const { data, error } = await supabase.auth.signUp({
    email: emailInput || placeholderEmail(phone),
    password,
    options: { data: { username, phone_number: phone } },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "That email is already registered. Try logging in." };
    }
    return { error: error.message };
  }

  // "Confirm email" is off in Supabase → the player is signed in right away.
  if (data.session) redirect("/dashboard");

  return {
    success: emailInput
      ? `Account created. We sent a confirmation link to ${emailInput} — open it, then log in.`
      : "Account created. You can log in now.",
  };
}

// -------------------------------------------------------------- sign out
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
