"use server";

import { createClient } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; message?: string } | undefined;

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8) return { ok: false, message: "New password must be at least 8 characters." };
  if (password !== confirm) return { ok: false, message: "The two passwords don't match." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    if (error.message.toLowerCase().includes("different")) return { ok: false, message: "Choose a password different from your current one." };
    return { ok: false, message: "Could not change password. Please log in again and retry." };
  }
  return { ok: true, message: "Password changed." };
}
