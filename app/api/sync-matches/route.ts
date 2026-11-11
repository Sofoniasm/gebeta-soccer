/**
 * GET /api/sync-matches
 * ---------------------------------------------------------------
 * Pulls matches from football-data.org (v4) and upserts them into the
 * `matches` table — new fixtures are added, and kickoff times, status
 * and final scores of existing ones are updated.
 *
 * It never touches `round_id`, so matches the admin has already put
 * into a round stay there.
 *
 * Security: requires `Authorization: Bearer <CRON_SECRET>`.
 * Vercel Cron sends this header automatically when the CRON_SECRET
 * environment variable is set (see vercel.json).
 *
 * Optional query params:
 *   ?competitions=PL,CL     which leagues (default: FOOTBALL_COMPETITIONS env or "PL")
 *   ?daysBack=3&daysAhead=10 date window (football-data allows max 10 days per request)
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const API_BASE = "https://api.football-data.org/v4";

// --- football-data.org response shape (only the fields we use) -------
interface FdTeam {
  name: string | null;
  shortName: string | null;
  crest: string | null;
}
interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string; name: string };
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: { fullTime: { home: number | null; away: number | null } };
}

/** Map football-data statuses onto our five statuses. */
function mapStatus(s: string): "scheduled" | "live" | "finished" | "postponed" | "cancelled" {
  switch (s) {
    case "IN_PLAY":
    case "PAUSED":
    case "LIVE":
      return "live";
    case "FINISHED":
    case "AWARDED":
      return "finished";
    case "POSTPONED":
    case "SUSPENDED":
      return "postponed";
    case "CANCELLED":
      return "cancelled";
    default: // SCHEDULED, TIMED
      return "scheduled";
  }
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function GET(req: NextRequest) {
  // 1. Only Vercel Cron (or you, with the secret) may call this.
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.FOOTBALL_DATA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "FOOTBALL_DATA_API_KEY is not set" }, { status: 500 });
  }

  // 2. Work out which leagues and dates to fetch.
  const params = req.nextUrl.searchParams;
  const competitions = (params.get("competitions") ?? process.env.FOOTBALL_COMPETITIONS ?? "PL")
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);
  const daysBack = Math.min(Math.max(Number(params.get("daysBack") ?? 3), 0), 10);
  const daysAhead = Math.min(Math.max(Number(params.get("daysAhead") ?? 7), 0), 10 - daysBack);

  const now = new Date();
  const dateFrom = isoDate(new Date(now.getTime() - daysBack * 86_400_000));
  const dateTo = isoDate(new Date(now.getTime() + daysAhead * 86_400_000));

  // 3. Fetch each competition (free tier: 10 requests/minute).
  const fetched: FdMatch[] = [];
  const errors: string[] = [];

  for (const code of competitions) {
    const url = `${API_BASE}/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    const res = await fetch(url, {
      headers: { "X-Auth-Token": apiKey },
      cache: "no-store",
    });
    if (!res.ok) {
      errors.push(`${code}: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
      continue;
    }
    const body = (await res.json()) as { matches?: FdMatch[] };
    fetched.push(...(body.matches ?? []));
  }

  // 4. Convert to our row shape. round_id is deliberately left out.
  const rows = fetched
    .filter((m) => m.homeTeam?.name && m.awayTeam?.name) // skip TBD knockout slots
    .map((m) => {
      const status = mapStatus(m.status);
      return {
        external_id: m.id,
        competition: m.competition?.name ?? null,
        home_team: m.homeTeam.shortName ?? m.homeTeam.name!,
        away_team: m.awayTeam.shortName ?? m.awayTeam.name!,
        home_crest: m.homeTeam.crest,
        away_crest: m.awayTeam.crest,
        kickoff_at: m.utcDate,
        status,
        // Only store a score once the match is over.
        actual_home_score: status === "finished" ? m.score.fullTime.home : null,
        actual_away_score: status === "finished" ? m.score.fullTime.away : null,
        updated_at: new Date().toISOString(),
      };
    });

  // 5. Upsert on the football-data id.
  let upserted = 0;
  if (rows.length > 0) {
    const supabase = createAdminClient();
    const { error, count } = await supabase
      .from("matches")
      .upsert(rows, { onConflict: "external_id", count: "exact" });
    if (error) {
      return NextResponse.json({ error: error.message, errors }, { status: 500 });
    }
    upserted = count ?? rows.length;
  }

  return NextResponse.json({
    ok: errors.length === 0,
    competitions,
    window: { dateFrom, dateTo },
    fetched: fetched.length,
    upserted,
    errors,
  });
}
