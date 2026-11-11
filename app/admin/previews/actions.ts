"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { predictionPath } from "@/lib/predictions";

function back(kind: "msg" | "err", text: string, match?: number): never {
  revalidatePath("/admin/previews");
  revalidatePath("/predictions", "layout");
  revalidatePath("/sitemap.xml");
  redirect(`/admin/previews?${kind}=${encodeURIComponent(text)}${match ? `&match=${match}` : ""}`);
}

const score = (v: FormDataEntryValue | null) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 20 ? n : null;
};

export async function savePreview(formData: FormData) {
  const adminId = await requireAdminId("/admin/previews");
  const matchId = Number(formData.get("match_id"));
  const home = score(formData.get("pick_home"));
  const away = score(formData.get("pick_away"));
  const confidence = String(formData.get("confidence") ?? "medium");
  const verdict = String(formData.get("verdict") ?? "").trim().replace(/\s+/g, " ");
  const body = String(formData.get("body") ?? "").trim();
  const published = formData.get("published") === "on";

  if (!matchId) back("err", "Pick a match first.");
  if (home === null || away === null) back("err", "Enter your predicted score (0 to 20 for each team).", matchId);
  if (verdict.length < 20 || verdict.length > 400) back("err", "The short answer must be 20 to 400 characters.", matchId);
  if (!["low", "medium", "high"].includes(confidence)) back("err", "Pick a confidence level.", matchId);

  const admin = createAdminClient();
  const { data: m } = await admin.from("matches").select("id, home_team, away_team").eq("id", matchId).maybeSingle();
  if (!m) back("err", "Match not found.");

  const { error } = await admin.from("match_previews").upsert(
    {
      match_id: matchId,
      pick_home: home,
      pick_away: away,
      confidence,
      verdict,
      body,
      is_published: published,
      author_id: adminId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "match_id" },
  );
  if (error) back("err", `Could not save: ${error.message}. Did you run the 0022 SQL?`, matchId);
  revalidatePath(predictionPath(m));
  back("msg", published ? `Published. Live at ${predictionPath(m)}` : "Saved as draft (not visible).", matchId);
}

export async function deletePreview(formData: FormData) {
  await requireAdminId("/admin/previews");
  const matchId = Number(formData.get("match_id"));
  const { error } = await createAdminClient().from("match_previews").delete().eq("match_id", matchId);
  if (error) back("err", error.message, matchId);
  back("msg", "Preview deleted.");
}
