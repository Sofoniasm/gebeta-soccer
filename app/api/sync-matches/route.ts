/**
 * GET /api/sync-matches — daily cron (see vercel.json).
 * Requires `Authorization: Bearer <CRON_SECRET>`; Vercel Cron sends it
 * automatically when the CRON_SECRET env var is set.
 *
 * Optional query: ?competitions=PL,CL&daysBack=3&daysAhead=7
 */
import { NextResponse, type NextRequest } from "next/server";
import { syncMatches } from "@/lib/football/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { settleDueRounds } from "@/lib/round-settle";
import { createDueAutoRounds } from "@/lib/auto-rounds";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  try {
    const result = await syncMatches({
      competitions: p.get("competitions")?.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
      daysBack: p.has("daysBack") ? Number(p.get("daysBack")) : undefined,
      daysAhead: p.has("daysAhead") ? Number(p.get("daysAhead")) : undefined,
    });
    // Private challenges whose matches are over get paid (or refunded) right away.
    const { data: settled } = await createAdminClient().rpc("settle_due_challenges");
    // Rounds marked "settle automatically" whose matches are all over get paid too.
    let roundsSettled: string[] = [];
    try {
      roundsSettled = await settleDueRounds();
    } catch (e) {
      roundsSettled = [`round settle error: ${(e as Error).message}`];
    }
    if (Number(settled) > 0 || roundsSettled.length > 0) await pushNotifications();
    // Morning / Evening / Night rounds (EAT) open by themselves when a slot has 10 matches.
    const autoRounds = await createDueAutoRounds();
    // Gebeta Premium renewals (from the wallet; ends quietly when there aren't enough Units).
    let premiumRenewed = 0;
    try {
      const { data: n } = await createAdminClient().rpc("renew_due_subscriptions");
      premiumRenewed = Number(n ?? 0);
      await pushNotifications();
    } catch {
      /* 0031 not run yet */
    }
    return NextResponse.json({ ...result, challengesSettled: Number(settled ?? 0), roundsSettled, autoRounds, premiumRenewed }, { status: result.ok ? 200 : 207 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
