/**
 * GET /api/chess/<code> — the game's state for the signed-in player (polled every 1.5 seconds during play).
 * The database keeps the board and the 60-second clock; a player who runs out of time loses the first time anyone asks.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";
import { driveBot } from "@/lib/chess-bot";
import type { ChessState } from "@/lib/chess";

export const dynamic = "force-dynamic";
export const maxDuration = 30; // the House Bot thinks for a couple of seconds

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code: raw } = await ctx.params;
  const code = decodeURIComponent(raw).toUpperCase().slice(0, 12);
  const supabase = await createClient();
  const read = () => supabase.rpc("chess_state", { p_code: code });
  let { data, error } = await read();
  if (error) {
    const signedOut = error.message.includes("not signed in");
    return NextResponse.json({ error: signedOut ? "not signed in" : "unavailable" }, { status: signedOut ? 401 : 500, headers: { "Cache-Control": "no-store" } });
  }
  // the House Bot joins a game that waited long enough and plays its moves; then read the game again
  if (data && (await driveBot(code, data as ChessState))) ({ data, error } = await read());
  const state = data as { status?: string } | null;
  if (state && (state.status === "settled" || state.status === "cancelled")) void pushNotifications();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
