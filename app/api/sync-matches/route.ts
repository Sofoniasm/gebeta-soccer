/**
 * GET /api/sync-matches — the scheduled sync (GitHub Actions every 2 hours, Vercel cron daily).
 * Requires `Authorization: Bearer <CRON_SECRET>`; Vercel Cron sends it
 * automatically when the CRON_SECRET env var is set.
 * The same job also runs on demand from /api/sync-kick while players use the app.
 *
 * Optional query: ?competitions=PL,CL&daysBack=3&daysAhead=7
 */
import { NextResponse, type NextRequest } from "next/server";
import { runSyncPipeline } from "@/lib/sync-pipeline";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  try {
    const { body, status } = await runSyncPipeline({
      competitions: p.get("competitions")?.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean),
      daysBack: p.has("daysBack") ? Number(p.get("daysBack")) : undefined,
      daysAhead: p.has("daysAhead") ? Number(p.get("daysAhead")) : undefined,
    });
    return NextResponse.json(body, { status });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
