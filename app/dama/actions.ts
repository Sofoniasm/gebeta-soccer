"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";
import { etbToUnits } from "@/lib/challenges";
import { DAMA_STAKES_ETB, damaError } from "@/lib/dama";

export type DamaResult = { ok: boolean; message: string; code?: string };

const cleanCode = (c: string) => String(c ?? "").trim().toUpperCase().slice(0, 12);

export async function createDama(stakeEtb: number): Promise<DamaResult> {
  if (!(DAMA_STAKES_ETB as readonly number[]).includes(stakeEtb)) return { ok: false, message: "Pick one of the stakes." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dama_create", { p_stake: etbToUnits(stakeEtb) });
  if (error) return { ok: false, message: damaError(error.message) };
  revalidatePath("/dama");
  revalidatePath("/wallet");
  return { ok: true, code: String(data), message: "Game created." };
}

export async function joinDama(code: string): Promise<DamaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dama_join", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: damaError(error.message) };
  await pushNotifications(); // tells the creator
  revalidatePath("/dama");
  revalidatePath("/wallet");
  return { ok: true, message: "You're in! The game has started." };
}

export async function cancelDama(code: string): Promise<DamaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dama_cancel", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: damaError(error.message) };
  revalidatePath("/dama");
  revalidatePath("/wallet");
  return { ok: true, message: "Your stake is back in your wallet." };
}

export async function moveDama(code: string, from: number, to: number): Promise<DamaResult> {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from > 63 || to < 0 || to > 63) return { ok: false, message: "Pick a piece and a square." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("dama_move", { p_code: cleanCode(code), p_from: from, p_to: to });
  if (error) return { ok: false, message: damaError(error.message) };
  return { ok: true, message: "" };
}

export async function resignDama(code: string): Promise<DamaResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("dama_resign", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: damaError(error.message) };
  await pushNotifications();
  revalidatePath("/wallet");
  return { ok: true, message: "You resigned." };
}
