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
export async function driveBot(code: string, st: ChessState): Promise<{ changed: boolean; note: string | null }> {
  if (st.status === "open" && st.open_to_all && st.my_seat === 1 && st.bot_wait_s === 0) {
    const { data, error } = await createAdminClient().rpc("chess_bot_join", { p_code: code });
    if (data === true) {
      await pushNotifications();
      const why = await botMoveWhy(code); // the bot may be white and open the game
      if (!why.startsWith("moved")) console.error("house bot did not move:", why);
      return { changed: true, note: why };
    }
    return { changed: false, note: error ? `join error: ${error.message}` : "the bot did not join" };
  }
  if (st.status === "live" && st.vs_bot && st.bot_to_move) {
    const why = await botMoveWhy(code);
    if (!why.startsWith("moved")) console.error("house bot did not move:", why);
    return { changed: why.startsWith("moved"), note: why };
  }
  return { changed: false, note: null };
}

/**
 * Called whenever players are using the app (see /api/sync-kick): lets the House Bot join open games that waited long
 * enough EVEN IF their creator left the page, and plays the bot's pending moves. Cheap when the bot is off or idle.
 * Returns how many games the bot joined.
 */
export async function tickBots(): Promise<number> {
  const admin = createAdminClient();
  const { data: s } = await admin.from("house_bot_settings").select("enabled, paused_at, join_after_seconds").eq("id", 1).maybeSingle();
  if (!s || !s.enabled || s.paused_at) return 0;
  const cutoff = new Date(Date.now() - Number(s.join_after_seconds) * 1000).toISOString();
  const { data: open } = await admin.from("chess_games").select("code").eq("status", "open").eq("open_to_all", true).lte("created_at", cutoff).limit(5);
  let joinedCount = 0;
  for (const g of (open ?? []) as { code: string }[]) {
    const { data: joined } = await admin.rpc("chess_bot_join", { p_code: g.code });
    if (joined === true) {
      joinedCount++;
      await botMoveWhy(g.code); // the bot may be white and open the game
    }
  }
  const { data: live } = await admin.from("chess_games").select("code").eq("status", "live").eq("vs_bot", true).limit(10);
  for (const g of (live ?? []) as { code: string }[]) await botMoveWhy(g.code); // only moves when it is the bot's turn
  if (joinedCount > 0) await pushNotifications(); // "The House Bot joined your Chess game"
  return joinedCount;
}
