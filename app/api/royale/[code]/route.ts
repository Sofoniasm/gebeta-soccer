/**
 * GET /api/royale/<code> — the room's state for the signed-in player (polled once a second during a game).
 * The database builds it: the right answer of a question is only included after its 15 seconds are over, and
 * the game is settled (paid or refunded) the first time anyone asks after it ended.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("royale_state", { p_code: decodeURIComponent(code).toUpperCase().slice(0, 12) });
  if (error) {
    const signedOut = error.message.includes("not signed in");
    return NextResponse.json({ error: signedOut ? "not signed in" : "unavailable" }, { status: signedOut ? 401 : 500, headers: { "Cache-Control": "no-store" } });
  }
  const state = data as { status?: string } | null;
  // The first poll after the end pays the winner: tell everyone by Telegram too.
  if (state && (state.status === "settled" || state.status === "refunded")) void pushNotifications();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
