"use server";

import { redirect } from "next/navigation";

/** "Got a code?" box: GC-AB12CD (or just AB12CD) -> /challenges/GC-AB12CD */
export async function openChallengeByCode(formData: FormData) {
  let code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (/^[A-Z0-9]{6}$/.test(code)) code = `GC-${code}`;
  if (!/^GC-[A-Z0-9]{6}$/.test(code)) redirect(`/challenges?err=${encodeURIComponent("That doesn't look like a challenge code (GC-XXXXXX).")}`);
  redirect(`/challenges/${code}`);
}
