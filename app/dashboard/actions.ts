"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok: boolean; message: string };

/** Pay the entry fee and join the round (runs the enter_round SQL function). */
export async function joinRound(roundId: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("enter_round", { p_round_id: roundId });
  if (error) {
    const msg = error.message.includes("insufficient balance")
      ? "Not enough balance. Top up via Telebirr and send the receipt on Telegram."
      : error.message.includes("already entered")
        ? "You're already in this round."
        : error.message.includes("not open")
          ? "This round is closed."
          : "Could not join the round. Please try again.";
    return { ok: false, message: msg };
  }
  revalidatePath("/dashboard");
  return { ok: true, message: "You're in! Now make your predictions." };
}

export interface PredictionInput {
  matchId: number;
  home: number;
  away: number;
}

/**
 * Save predictions. Row Level Security on the database makes sure the user
 * has joined the round and every match is still before kickoff — matches
 * that already started are rejected by the database itself.
 */
export async function savePredictions(predictions: PredictionInput[]): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Please log in again." };

  const clean = predictions.filter(
    (p) =>
      Number.isInteger(p.home) && Number.isInteger(p.away) &&
      p.home >= 0 && p.home <= 20 && p.away >= 0 && p.away <= 20
  );
  if (clean.length === 0) return { ok: false, message: "Enter at least one score." };

  // Which of these already exist? (update those, insert the rest)
  const { data: existing } = await supabase
    .from("predictions")
    .select("id, match_id")
    .eq("user_id", user.id)
    .in("match_id", clean.map((p) => p.matchId));
  const existingByMatch = new Map((existing ?? []).map((r: { id: number; match_id: number }) => [r.match_id as number, r.id as number]));

  const toInsert = clean
    .filter((p) => !existingByMatch.has(p.matchId))
    .map((p) => ({
      user_id: user.id,
      match_id: p.matchId,
      predicted_home_score: p.home,
      predicted_away_score: p.away,
    }));

  let failed = 0;

  if (toInsert.length > 0) {
    const { error } = await supabase.from("predictions").insert(toInsert);
    if (error) {
      // One locked match fails the whole batch — retry one by one.
      for (const row of toInsert) {
        const { error: e } = await supabase.from("predictions").insert(row);
        if (e) failed++;
      }
    }
  }

  for (const p of clean.filter((p) => existingByMatch.has(p.matchId))) {
    const { data, error } = await supabase
      .from("predictions")
      .update({ predicted_home_score: p.home, predicted_away_score: p.away })
      .eq("id", existingByMatch.get(p.matchId)!)
      .select("id");
    if (error || !data || data.length === 0) failed++;
  }

  revalidatePath("/dashboard");
  const saved = clean.length - failed;
  if (failed > 0) {
    return {
      ok: saved > 0,
      message: `Saved ${saved} prediction${saved === 1 ? "" : "s"}. ${failed} could not be saved (match already started or round closed).`,
    };
  }
  return { ok: true, message: `Saved ${saved} prediction${saved === 1 ? "" : "s"}. Good luck!` };
}
