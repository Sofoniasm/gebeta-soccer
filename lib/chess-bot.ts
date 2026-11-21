/**
 * The House Bot for Chess, server side: joins open games after the wait, and plays its moves with Stockfish.
 * Every rule and every limit lives in the database (0061_house_bot.sql); this file only asks the database
 * ("may the bot join?", "is it the bot's turn?"), thinks, and writes the move through the same checked path as a player.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { checkMove } from "@/lib/chess-rules";
import { bestMove, parseUci } from "@/lib/stockfish";
import type { ChessState } from "@/lib/chess";

/** Plays the bot's move when it is the bot's turn (only one request at a time gets to do it). */
export async function botMove(code: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data: claimed } = await admin.rpc("chess_bot_claim", { p_code: code });
  if (claimed !== true) return false;
  const [{ data: game }, { data: s }] = await Promise.all([
    admin.from("chess_games").select("fen, status, vs_bot").eq("code", code).single(),
    admin.from("house_bot_settings").select("bot_id").eq("id", 1).single(),
  ]);
  if (!game || !s || game.status !== "live" || !game.vs_bot) return false;

  const uci = await bestMove(game.fen as string);
  const mv = uci ? parseUci(uci) : null;
  if (!mv) return false; // the claim runs out in a few seconds and the next request tries again
  const chk = checkMove(game.fen as string, mv.from, mv.to, mv.promotion ?? "q");
  if (!chk.ok) return false;
  const { error } = await admin.rpc("chess_apply_move", {
    p_code: code,
    p_user: s.bot_id,
    p_expected_fen: game.fen,
    p_new_fen: chk.newFen,
    p_san: chk.san,
    p_from: mv.from,
    p_to: mv.to,
    p_outcome: chk.outcome,
  });
  if (error) return false;
  if (chk.outcome) await pushNotifications();
  return true;
}

/**
 * Called whenever a player's page asks for the game: lets the bot join a game that waited long enough,
 * and makes the bot move if it is its turn. Returns true when something changed (the caller re-reads the state).
 */
export async function driveBot(code: string, st: ChessState): Promise<boolean> {
  let changed = false;
  if (st.status === "open" && st.open_to_all && st.my_seat === 1 && st.bot_wait_s === 0) {
    const { data } = await createAdminClient().rpc("chess_bot_join", { p_code: code });
    if (data === true) {
      changed = true;
      await pushNotifications();
      await botMove(code); // the bot may be white and open the game
    }
    return changed;
  }
  if (st.status === "live" && st.vs_bot && st.bot_to_move) changed = await botMove(code);
  return changed;
}
