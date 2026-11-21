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

/** Plays the bot's move when it is the bot's turn (only one request at a time gets to do it). Returns what happened. */
export async function botMoveWhy(code: string): Promise<string> {
  try {
    const admin = createAdminClient();
    const { data: claimed, error: ce } = await admin.rpc("chess_bot_claim", { p_code: code });
    if (ce) return `claim error: ${ce.message}`;
    if (claimed !== true) return "not claimed (not the bot's turn, or another request is already thinking)";
    const [{ data: game, error: ge }, { data: s, error: se }] = await Promise.all([
      admin.from("chess_games").select("fen, status, vs_bot").eq("code", code).single(),
      admin.from("house_bot_settings").select("bot_id").eq("id", 1).single(),
    ]);
    if (ge || se || !game || !s) return `read error: ${ge?.message ?? se?.message ?? "no row"}`;
    if (game.status !== "live" || !game.vs_bot) return "game is not a live bot game";

    const uci = await bestMove(game.fen as string);
    if (!uci) return "the engine gave no move";
    const mv = parseUci(uci);
    if (!mv) return `unreadable engine move: ${uci}`;
    const chk = checkMove(game.fen as string, mv.from, mv.to, mv.promotion ?? "q");
    if (!chk.ok) return `engine move ${uci} is not legal`;
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
    if (error) return `apply error: ${error.message}`;
    if (chk.outcome) await pushNotifications();
    return `moved ${chk.san}`;
  } catch (e) {
    return `exception: ${(e as Error).message}`;
  }
}

export async function botMove(code: string): Promise<boolean> {
  const why = await botMoveWhy(code);
  if (!why.startsWith("moved")) console.error("house bot did not move:", why);
  return why.startsWith("moved");
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
