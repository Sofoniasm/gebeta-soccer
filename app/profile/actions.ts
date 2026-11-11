"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { dobError } from "@/lib/age";

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

// ------------------------------------------------------------ profile picture

const AVATAR_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
type Result = { ok: boolean; message: string };

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/** Remove the old uploaded file (only files inside our avatars bucket). */
async function removeStoredAvatar(admin: ReturnType<typeof createAdminClient>, url: string | null) {
  const m = url?.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/);
  if (m) await admin.storage.from("avatars").remove([decodeURIComponent(m[1])]);
}

export async function uploadAvatar(formData: FormData): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { ok: false, message: "Please log in again." };
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a picture first." };
  const ext = AVATAR_TYPES[file.type];
  if (!ext) return { ok: false, message: "Use a JPG, PNG or WebP picture." };
  if (file.size > 1024 * 1024) return { ok: false, message: "That picture is too big (max 1 MB)." };

  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("avatar_url").eq("id", uid).single();
  const path = `${uid}/${Date.now()}.${ext}`;
  const up = await admin.storage.from("avatars").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) return { ok: false, message: "Upload failed. Please try again." };
  const url = admin.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  const { error } = await admin.from("profiles").update({ avatar_url: url }).eq("id", uid);
  if (error) return { ok: false, message: "Could not save the picture." };
  await removeStoredAvatar(admin, before?.avatar_url ?? null);
  return { ok: true, message: "Profile picture updated." };
}

export async function removeAvatar(): Promise<Result> {
  const uid = await currentUserId();
  if (!uid) return { ok: false, message: "Please log in again." };
  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("avatar_url").eq("id", uid).single();
  await admin.from("profiles").update({ avatar_url: null }).eq("id", uid);
  await removeStoredAvatar(admin, before?.avatar_url ?? null);
  return { ok: true, message: "Picture removed." };
}

export async function saveDateOfBirth(dob: string): Promise<Result> {
  const problem = dobError(dob);
  if (problem) return { ok: false, message: problem };
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_date_of_birth", { p_dob: dob });
  if (error) {
    if (error.message.includes("already")) return { ok: false, message: "Your date of birth is already saved." };
    if (error.message.includes("18")) return { ok: false, message: "You must be 18 or older to play GebetaSoccer." };
    return { ok: false, message: "Could not save. Did the admin run the latest SQL?" };
  }
  return { ok: true, message: "Saved. Thank you!" };
}

// ------------------------------------------------------------ responsible play
export async function takeBreak(days: number): Promise<Result> {
  if (![1, 7, 30].includes(days)) return { ok: false, message: "Choose 24 hours, 7 days or 30 days." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("take_a_break", { p_days: days });
  if (error) return { ok: false, message: "Could not start the break. Did the admin run the latest SQL?" };
  const until = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(String(data)));
  return { ok: true, message: `Your break has started. Betting is paused until ${until}. You can still withdraw.` };
}

export async function saveDepositLimit(etb: number | null): Promise<Result> {
  if (etb !== null && (!Number.isFinite(etb) || etb < 1000 || etb > 1_000_000)) return { ok: false, message: "Choose a limit between 1,000 and 1,000,000 ETB." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("set_deposit_limit", { p_units: etb === null ? null : Math.round((etb / 200) * 100) / 100 });
  if (error) return { ok: false, message: "Could not save the limit. Please try again." };
  if (data === "now") return { ok: true, message: etb === null ? "No deposit limit." : `Done: you can deposit at most ${etb.toLocaleString("en-US")} ETB in any 7 days.` };
  return {
    ok: true,
    message: etb === null
      ? "Your limit will be removed in 7 days. Until then the current limit stays."
      : `Your limit goes up to ${etb.toLocaleString("en-US")} ETB in 7 days. Until then the current limit stays.`,
  };
}
