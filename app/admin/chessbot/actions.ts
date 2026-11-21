"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

const BOT_ID = "00000000-0000-4000-8000-00000000b075";

function back(kind: "msg" | "err", text: string): never {
  revalidatePath("/admin/chessbot");
  redirect(`/admin/chessbot?${kind}=${encodeURIComponent(text)}`);
}

const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").trim());

/** Save the limits (switch on/off, stake, loss, streak, per-player games, wait). */
export async function saveChessBotSettings(formData: FormData) {
  await requireAdminId("/admin/chessbot");
  const enabled = formData.get("enabled") === "on";
  const maxStake = num(formData.get("max_stake_units"));
  const dailyLoss = num(formData.get("daily_loss_limit_units"));
  const streak = Math.round(num(formData.get("max_consecutive_losses")));
  const perPlayer = Math.round(num(formData.get("per_player_daily_games")));
  const wait = Math.round(num(formData.get("join_after_seconds")));
  const { error } = await createAdminClient()
    .from("house_bot_settings")
    .update({
      enabled,
      max_stake_units: maxStake,
      daily_loss_limit_units: dailyLoss,
      max_consecutive_losses: streak,
      per_player_daily_games: perPlayer,
      join_after_seconds: wait,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) back("err", "Could not save: check the numbers (stake 1-50 Units, loss limit at least 1, streak 1-10, games 1-50, wait 30-3600 s).");
  back("msg", enabled ? "Saved. The House Bot is ON." : "Saved. The House Bot is OFF.");
}

export async function resumeChessBot() {
  await requireAdminId("/admin/chessbot");
  const { error } = await createAdminClient().from("house_bot_settings").update({ paused_at: null, paused_reason: null, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) back("err", error.message);
  back("msg", "The House Bot accepts games again.");
}

export async function pauseChessBot() {
  await requireAdminId("/admin/chessbot");
  const { error } = await createAdminClient().from("house_bot_settings").update({ paused_at: new Date().toISOString(), paused_reason: "Paused by the admin", updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) back("err", error.message);
  back("msg", "The House Bot is paused. Games already playing finish normally.");
}

/** Put Units into the House Bot's wallet (the house bank that pays players who win). */
export async function fundChessBot(formData: FormData) {
  const adminId = await requireAdminId("/admin/chessbot");
  const units = num(formData.get("units"));
  if (!Number.isFinite(units) || units < 5 || units > 500) back("err", "Enter 5 to 500 Units (the wallet needs at least 5 Units per top-up).");
  const { error } = await createAdminClient().rpc("admin_add_units", { p_user_id: BOT_ID, p_units: units, p_reference: "House Bot bank", p_admin_id: adminId });
  if (error) back("err", error.message);
  back("msg", `${units} Units added to the House Bot wallet.`);
}
