"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";
import { CHALLENGE_MAX_MATCHES, challengeError, etbToUnits, stakeError } from "@/lib/challenges";
import { normalizeProps, type HtResult, type PropKey } from "@/lib/challenge-props";

export interface PickInput {
  matchId: number;
  home: number;
  away: number;
  /** Extra picks (only sent when the challenge has them switched on). */
  btts?: boolean | null;
  over25?: boolean | null;
  ht?: HtResult | null;
}
export type ChallengeResult = { ok: boolean; message: string; code?: string };

const okScore = (n: number) => Number.isInteger(n) && n >= 0 && n <= 20;
const toJson = (picks: PickInput[]) =>
  picks.map((p) => ({
    match_id: p.matchId,
    home: p.home,
    away: p.away,
    ...(typeof p.btts === "boolean" ? { btts: p.btts } : {}),
    ...(typeof p.over25 === "boolean" ? { over25: p.over25 } : {}),
    ...(p.ht ? { ht: p.ht } : {}),
  }));
const validPicks = (picks: PickInput[]) =>
  picks.length >= 1 &&
  picks.length <= CHALLENGE_MAX_MATCHES &&
  new Set(picks.map((p) => p.matchId)).size === picks.length &&
  picks.every((p) => okScore(p.home) && okScore(p.away));

function refresh(code?: string) {
  revalidatePath("/challenges");
  if (code) revalidatePath(`/challenges/${code}`);
  revalidatePath("/wallet");
}

export async function createChallenge(input: { title: string; stakeEtb: number; maxPlayers: number | null; picks: PickInput[]; props?: PropKey[] }): Promise<ChallengeResult> {
  const title = input.title.trim();
  if (title.length < 3 || title.length > 60) return { ok: false, message: "Give the challenge a name (3 to 60 characters)." };
  const se = stakeError(input.stakeEtb);
  if (se) return { ok: false, message: se };
  if (!validPicks(input.picks)) return { ok: false, message: "Pick 1 to 10 matches and enter a score (0 to 20) for each." };
  const max = input.maxPlayers && input.maxPlayers >= 2 && input.maxPlayers <= 100 ? Math.floor(input.maxPlayers) : null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_challenge", {
    p_title: title,
    p_stake: etbToUnits(input.stakeEtb),
    p_max_players: max,
    p_picks: toJson(input.picks),
    p_props: normalizeProps(input.props),
  });
  if (error) return { ok: false, message: challengeError(error.message) };
  refresh(String(data));
  return { ok: true, code: String(data), message: "Challenge created." };
}

export async function joinChallenge(code: string, picks: PickInput[]): Promise<ChallengeResult> {
  if (!validPicks(picks)) return { ok: false, message: "Enter a score (0 to 20) for every match." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("join_challenge", { p_code: code, p_picks: toJson(picks) });
  if (error) return { ok: false, message: challengeError(error.message) };
  await pushNotifications(); // tell the creator someone joined
  refresh(code);
  return { ok: true, message: "You're in! Your stake is locked. You can change your scores until the first kickoff." };
}

export async function saveChallengePicks(code: string, picks: PickInput[]): Promise<ChallengeResult> {
  if (!validPicks(picks)) return { ok: false, message: "Enter a score (0 to 20) for every match." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_challenge_picks", { p_code: code, p_picks: toJson(picks) });
  if (error) return { ok: false, message: challengeError(error.message) };
  refresh(code);
  return { ok: true, message: "Scores saved." };
}

export async function cancelChallenge(code: string): Promise<ChallengeResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_challenge", { p_code: code });
  if (error) return { ok: false, message: challengeError(error.message) };
  refresh(code);
  return { ok: true, message: "Challenge cancelled. Your stake is back in your wallet." };
}
