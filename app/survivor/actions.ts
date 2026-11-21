"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";
import { etbToUnits } from "@/lib/challenges";
import { SURVIVOR_DAYS, SURVIVOR_MIN_PLAYERS, SURVIVOR_STAKES_ETB, survivorError } from "@/lib/survivor";

export type SurvivorResult = { ok: boolean; message: string; code?: string };

const cleanCode = (c: string) => String(c ?? "").trim().toUpperCase().slice(0, 12);

export async function createSurvivor(stakeEtb: number, minPlayers: number, maxDays: number): Promise<SurvivorResult> {
  if (!(SURVIVOR_STAKES_ETB as readonly number[]).includes(stakeEtb)) return { ok: false, message: "Pick one of the stakes." };
  if (!(SURVIVOR_MIN_PLAYERS as readonly number[]).includes(minPlayers)) return { ok: false, message: "Pick how many players you need." };
  if (!(SURVIVOR_DAYS as readonly number[]).includes(maxDays)) return { ok: false, message: "Pick how many match days at most." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("survivor_create", { p_stake: etbToUnits(stakeEtb), p_min_players: minPlayers, p_max_days: maxDays });
  if (error) return { ok: false, message: survivorError(error.message) };
  revalidatePath("/survivor");
  revalidatePath("/wallet");
  return { ok: true, code: String(data), message: "Pool created." };
}

export async function joinSurvivor(code: string): Promise<SurvivorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("survivor_join", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: survivorError(error.message) };
  await pushNotifications(); // tells the creator
  revalidatePath("/survivor");
  revalidatePath("/wallet");
  return { ok: true, message: "You're in!" };
}

export async function leaveSurvivor(code: string): Promise<SurvivorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("survivor_leave", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: survivorError(error.message) };
  await pushNotifications();
  revalidatePath("/survivor");
  revalidatePath("/wallet");
  return { ok: true, message: "Your stake is back in your wallet." };
}

export async function startSurvivor(code: string): Promise<SurvivorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("survivor_start", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: survivorError(error.message) };
  await pushNotifications(); // "the pool started" to the other players
  return { ok: true, message: "The pool has started. Pick your team!" };
}

export async function pickSurvivor(code: string, matchId: number, side: "home" | "away"): Promise<SurvivorResult> {
  if (!Number.isInteger(matchId) || (side !== "home" && side !== "away")) return { ok: false, message: "Pick a team." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("survivor_pick", { p_code: cleanCode(code), p_match_id: matchId, p_side: side });
  if (error) return { ok: false, message: survivorError(error.message) };
  return { ok: true, message: "Pick saved. You can change it until the first kickoff." };
}
