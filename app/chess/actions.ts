"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthUser } from "@/lib/auth-user";
import { pushNotifications } from "@/lib/notify";
import { etbToUnits } from "@/lib/challenges";
import { CHESS_STAKES_ETB, chessError, type ChessState } from "@/lib/chess";
import { checkMove } from "@/lib/chess-rules";
import { botMove } from "@/lib/chess-bot";

export type ChessResult = { ok: boolean; message: string; code?: string };

const cleanCode = (c: string) => String(c ?? "").trim().toUpperCase().slice(0, 12);

export async function createChess(stakeEtb: number, openToAll: boolean): Promise<ChessResult> {
  if (!(CHESS_STAKES_ETB as readonly number[]).includes(stakeEtb)) return { ok: false, message: "Pick one of the stakes." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chess_create", { p_stake: etbToUnits(stakeEtb), p_open: openToAll === true });
  if (error) return { ok: false, message: chessError(error.message) };
  revalidatePath("/chess");
  revalidatePath("/wallet");
  return { ok: true, code: String(data), message: "Game created." };
}

export async function joinChess(code: string): Promise<ChessResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("chess_join", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: chessError(error.message) };
  await pushNotifications(); // tells the creator
  revalidatePath("/chess");
  revalidatePath("/wallet");
  return { ok: true, message: "You're in! The game has started." };
}

export async function cancelChess(code: string): Promise<ChessResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("chess_cancel", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: chessError(error.message) };
  revalidatePath("/chess");
  revalidatePath("/wallet");
  return { ok: true, message: "Your stake is back in your wallet." };
}

/**
 * A move: the server reads the position the database holds, checks the move with chess.js, and only then
 * writes it (with the service key, which the browser never has). The database again checks whose turn it is.
 */
export async function moveChess(code: string, from: string, to: string, promotion?: string): Promise<ChessResult> {
  const user = await getAuthUser();
  if (!user) return { ok: false, message: chessError("not signed in") };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chess_state", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: chessError(error.message) };
  const st = data as ChessState | null;
  if (!st) return { ok: false, message: chessError("game not found") };
  if (st.status !== "live") return { ok: false, message: chessError("not running") };
  if (!st.my_color) return { ok: false, message: chessError("not in this game") };
  if (st.my_color !== st.turn) return { ok: false, message: chessError("not your turn") };

  const chk = checkMove(st.fen, from, to, promotion ?? "q");
  if (!chk.ok) return { ok: false, message: chessError("illegal move") };

  const { error: e2 } = await createAdminClient().rpc("chess_apply_move", {
    p_code: cleanCode(code),
    p_user: user.id,
    p_expected_fen: st.fen,
    p_new_fen: chk.newFen,
    p_san: chk.san,
    p_from: from,
    p_to: to,
    p_outcome: chk.outcome,
  });
  if (e2) return { ok: false, message: chessError(e2.message) };
  if (chk.outcome) {
    await pushNotifications();
    revalidatePath("/wallet");
  } else if (st.vs_bot) {
    await botMove(cleanCode(code)); // the House Bot answers at once, so a player who leaves never wins on the bot's clock
  }
  return { ok: true, message: "" };
}

export async function resignChess(code: string): Promise<ChessResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("chess_resign", { p_code: cleanCode(code) });
  if (error) return { ok: false, message: chessError(error.message) };
  await pushNotifications();
  revalidatePath("/wallet");
  return { ok: true, message: "You resigned." };
}
