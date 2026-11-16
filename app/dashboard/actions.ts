"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { MAX_ROUND_MATCHES, MIN_ROUND_MATCHES } from "@/lib/round-slots";

export type ActionResult = { ok: boolean; message: string; slipNo?: number };
export interface PickInput {
  matchId: number;
  home: number;
  away: number;
}

function friendly(m: string): string {
  if (m.includes("taking a break")) return m.replace(/^.*betting paused: /, "Betting is paused: ") + ". You can still withdraw.";
  if (m.includes("date of birth")) return "Add your date of birth on your Profile before betting (18+ only).";
  if (m.includes("18 or older")) return "You must be 18 or older to bet.";
  if (m.includes("phone not verified")) return "Please confirm your phone number first.";
  if (m.includes("insufficient")) return "Not enough units in your wallet. Top up via Telebirr and send the receipt on Telegram.";
  if (m.includes("a score for all")) return "Fill in a score for every match first.";
  if (m.includes("round is closed")) return "Betting is closed — the round locked at the first kickoff.";
  if (m.includes("slip not found")) return "That slip wasn't found.";
  return "Something went wrong. Please try again.";
}

function toJson(picks: PickInput[]) {
  return picks.map((p) => ({ match_id: p.matchId, home: p.home, away: p.away }));
}

function valid(picks: PickInput[]): boolean {
  return (
    picks.length >= MIN_ROUND_MATCHES &&
    picks.length <= MAX_ROUND_MATCHES &&
    new Set(picks.map((p) => p.matchId)).size === picks.length &&
    picks.every((p) => Number.isInteger(p.home) && Number.isInteger(p.away) && p.home >= 0 && p.home <= 20 && p.away >= 0 && p.away <= 20)
  );
}

/** Place a new slip: a score for every match, paid now (entry fee), no refunds. */
export async function placeSlip(roundId: number, picks: PickInput[]): Promise<ActionResult> {
  if (!valid(picks)) return { ok: false, message: "Fill in a score (0–20) for every match first." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("place_slip", { p_round_id: roundId, p_picks: toJson(picks) });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath("/dashboard");
  revalidatePath("/wallet");
  return { ok: true, slipNo: Number(data), message: `Slip #${data} placed! You can still edit it for free until the first kickoff.` };
}

/** Change the scores on a placed slip (free, until the round locks). */
export async function updateSlip(slipId: number, picks: PickInput[]): Promise<ActionResult> {
  if (!valid(picks)) return { ok: false, message: "Every match needs a score (0–20)." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_slip", { p_slip_id: slipId, p_picks: toJson(picks) });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath("/dashboard");
  return { ok: true, message: "Changes saved." };
}
