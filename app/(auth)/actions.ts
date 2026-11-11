"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { normalizeEthiopianPhone } from "@/lib/phone";

export type AuthState = { error?: string; success?: string } | undefined;

/** Only allow redirects inside our own site. */
function safeNext(next: FormDataEntryValue | null): string {
  const n = typeof next === "string" ? next : "";
  return n.startsWith("/") && !n.startsWith("//") ? n : "/dashboard";
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;
}

// ---------------------------------------------------------------- login
export async function login(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: "Please confirm your email first — check your inbox (and spam)." };
    }
    return { error: "Wrong email or password." };
  }
  redirect(safeNext(formData.get("next")));
}

// ------------------------------------------------------------- register
export async function register(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const username = String(formData.get("username") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phoneRaw = String(formData.get("phone") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return { error: "Username: 3–24 letters, numbers or _ (no spaces)." };
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) return { error: "Enter a valid email address." };
  const phone = normalizeEthiopianPhone(phoneRaw);
  if (!phone) return { error: "Enter a valid Ethiopian mobile number, e.g. 0911 223 344." };
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
    email,
    password,
    options: {
      data: { username, phone_number: phone },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/dashboard`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already registered")) {
      return { error: "That email is already registered. Try logging in." };
    }
    return { error: error.message };
  }

  // If "Confirm email" is turned off in Supabase, the user is signed in already.
  if (data.session) redirect("/dashboard");

  return {
    success: `Almost done! We sent a confirmation link to ${email}. Open it to activate your account (check spam too).`,
  };
}

// -------------------------------------------------------------- sign out
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
