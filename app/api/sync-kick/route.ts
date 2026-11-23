/**
 * POST /api/sync-kick — "is the match data stale? then sync now". Called by the app while players are using it,
 * so scores, settling and the automatic rounds do not depend only on GitHub's (unreliable) schedule.
 * Anyone can ask, but the database lets only ONE request per 25 minutes win the claim, so it cannot be abused.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runSyncPipeline } from "@/lib/sync-pipeline";
import { tickBots } from "@/lib/chess-bot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  // The House Bot joins waiting open games and answers moves, even when the player left the page.
  const botJoined = await tickBots().catch(() => 0);
  const { data: won, error } = await createAdminClient().rpc("sync_try_claim", { p_gap_seconds: 1500 });
  if (error) return NextResponse.json({ ok: false, error: "unavailable" }, { status: 500 });
  if (won !== true) return NextResponse.json({ ok: true, ran: false, botJoined });
  try {
    const { body } = await runSyncPipeline();
    return NextResponse.json({ ok: true, ran: true, botJoined, synced: (body as { ok?: boolean }).ok ?? null });
  } catch {
    return NextResponse.json({ ok: false, ran: true }, { status: 500 });
  }
}
