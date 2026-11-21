"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";
import { etbToUnits } from "@/lib/challenges";
import { ROYALE_MIN_PLAYERS, ROYALE_STAKES_ETB, royaleError } from "@/lib/royale";

export type RoyaleResult = { ok: boolean; message: string; code?: string };

const cleanCode = (c: string) => String(c ?? "").trim().toUpperCase().slice(0, 12);

export async function createRoyale(stakeEtb: number, minPlayers: number): Promise<RoyaleResult> {
  if (!(ROYALE_STAKES_ETB as readonly number[]).includes(stakeEtb)) return { ok: false, message: "Pick one of the stakes." };
  if (!(ROYALE_MIN_PLAYERS as readonly number[]).includes(minPlayers)) return { ok: false, message: "Pick 3 to 6 players." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("royale_create", { p_stake: etbToUnits(stakeEtb), p_min_players: minPlayers });
  if (error) return { ok: false, message: royaleError(error.message) };
  revalidatePath("/royale");
  revalidatePath("/wallet");
  return { ok: true, code: String(data), message: "Room created." };
}

export async function joinRoyale(code: string): Promise<RoyaleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("royale_join", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: royaleError(error.message) };
  await pushNotifications(); // tells the creator
  revalidatePath("/royale");
  revalidatePath("/wallet");
  return { ok: true, message: "You're in!" };
}

export async function leaveRoyale(code: string): Promise<RoyaleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("royale_leave", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: royaleError(error.message) };
  await pushNotifications();
  revalidatePath("/royale");
  revalidatePath("/wallet");
  return { ok: true, message: "Your stake is back in your wallet." };
}

export async function startRoyale(code: string): Promise<RoyaleResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("royale_start", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: royaleError(error.message) };
  await pushNotifications(); // "Quiz Royale is starting" to the other players
  return { ok: true, message: "Starting…" };
}

export async function answerRoyale(code: string, questionIndex: number, choice: number): Promise<RoyaleResult> {
  if (!Number.isInteger(questionIndex) || !Number.isInteger(choice)) return { ok: false, message: "Pick one of the four answers." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("royale_answer", { p_code: cleanCode(code), p_q: questionIndex, p_choice: choice });
  if (error) return { ok: false, message: royaleError(error.message) };
  return { ok: true, message: "Locked in." };
}
