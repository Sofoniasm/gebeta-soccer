"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string; slipNo?: number };
export interface PickInput {
  matchId: number;
  home: number;
  away: number;
}

function friendly(m: string): string {
  if (m.includes("phone not verified")) return "Please confirm your phone number first.";
  if (m.includes("insufficient")) return "Not enough units in your wallet. Top up via Telebirr and send the receipt on Telegram.";
  if (m.includes("all 10")) return "Fill in a score for all 10 matches first.";
  if (m.includes("round is closed")) return "Betting is closed — the round locked at the first kickoff.";
  if (m.includes("slip not found")) return "That slip wasn't found.";
  return "Something went wrong. Please try again.";
}

function toJson(picks: PickInput[]) {
  return picks.map((p) => ({ match_id: p.matchId, home: p.home, away: p.away }));
}

function valid(picks: PickInput[]): boolean {
  return (
    picks.length === 10 &&
    new Set(picks.map((p) => p.matchId)).size === 10 &&
    picks.every((p) => Number.isInteger(p.home) && Number.isInteger(p.away) && p.home >= 0 && p.home <= 20 && p.away >= 0 && p.away <= 20)
  );
}

/** Place a new slip: all 10 scores, paid now (entry fee), no refunds. */
export async function placeSlip(roundId: number, picks: PickInput[]): Promise<ActionResult> {
  if (!valid(picks)) return { ok: false, message: "Fill in a score (0–20) for all 10 matches first." };
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
