/**
 * GET /api/gebeta/<code> — the game's state for the signed-in player (polled every 1.5 seconds during play).
 * The database keeps the board and the 60-second clock; a player who runs out of time loses the first time anyone asks.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("gebeta_state", { p_code: decodeURIComponent(code).toUpperCase().slice(0, 12) });
  if (error) {
    const signedOut = error.message.includes("not signed in");
    return NextResponse.json({ error: signedOut ? "not signed in" : "unavailable" }, { status: signedOut ? 401 : 500, headers: { "Cache-Control": "no-store" } });
  }
  const state = data as { status?: string } | null;
  if (state && (state.status === "settled" || state.status === "cancelled")) void pushNotifications();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
