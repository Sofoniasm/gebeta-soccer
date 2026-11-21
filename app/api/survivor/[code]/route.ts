/**
 * GET /api/survivor/<code> — the pool's state for the signed-in player (polled every 20 seconds).
 * The database builds it: other players' picks only show after the day's first kickoff, and finished match days
 * are resolved (and the pot paid) the first time anyone asks after they ended.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { pushNotifications } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("survivor_state", { p_code: decodeURIComponent(code).toUpperCase().slice(0, 12) });
  if (error) {
    const signedOut = error.message.includes("not signed in");
    return NextResponse.json({ error: signedOut ? "not signed in" : "unavailable" }, { status: signedOut ? 401 : 500, headers: { "Cache-Control": "no-store" } });
  }
  const state = data as { status?: string } | null;
  // Resolving a day may have queued "you're out", "next day is open" or "you won" messages: send them by Telegram too.
  if (state) void pushNotifications();
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}
