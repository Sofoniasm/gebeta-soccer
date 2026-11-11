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
