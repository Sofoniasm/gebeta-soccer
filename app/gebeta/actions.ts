"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";
import { etbToUnits } from "@/lib/challenges";
import { GEBETA_STAKES_ETB, gebetaError } from "@/lib/gebeta";

export type GebetaResult = { ok: boolean; message: string; code?: string };

const cleanCode = (c: string) => String(c ?? "").trim().toUpperCase().slice(0, 12);

export async function createGebeta(stakeEtb: number): Promise<GebetaResult> {
  if (!(GEBETA_STAKES_ETB as readonly number[]).includes(stakeEtb)) return { ok: false, message: "Pick one of the stakes." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gebeta_create", { p_stake: etbToUnits(stakeEtb) });
  if (error) return { ok: false, message: gebetaError(error.message) };
  revalidatePath("/gebeta");
  revalidatePath("/wallet");
  return { ok: true, code: String(data), message: "Game created." };
}

export async function joinGebeta(code: string): Promise<GebetaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gebeta_join", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: gebetaError(error.message) };
  await pushNotifications(); // tells the creator
  revalidatePath("/gebeta");
  revalidatePath("/wallet");
  return { ok: true, message: "You're in! The game has started." };
}

export async function cancelGebeta(code: string): Promise<GebetaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gebeta_cancel", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: gebetaError(error.message) };
  revalidatePath("/gebeta");
  revalidatePath("/wallet");
  return { ok: true, message: "Your stake is back in your wallet." };
}

export async function moveGebeta(code: string, pit: number): Promise<GebetaResult> {
  if (!Number.isInteger(pit) || pit < 0 || pit > 5) return { ok: false, message: "Pick one of your six pits." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("gebeta_move", { p_code: cleanCode(code), p_pit: pit });
  if (error) return { ok: false, message: gebetaError(error.message) };
  return { ok: true, message: "" };
}

export async function resignGebeta(code: string): Promise<GebetaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("gebeta_resign", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: gebetaError(error.message) };
  await pushNotifications();
  revalidatePath("/wallet");
  return { ok: true, message: "You resigned." };
}
