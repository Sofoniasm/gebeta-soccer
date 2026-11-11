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
    if (Number(settled) > 0) await pushNotifications();
    return NextResponse.json({ ...result, challengesSettled: Number(settled ?? 0) }, { status: result.ok ? 200 : 207 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
