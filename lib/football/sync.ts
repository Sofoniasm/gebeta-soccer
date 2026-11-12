/**
 * Shared match-sync logic — used by the daily cron (/api/sync-matches)
 * and the "Sync matches now" button in the admin panel.
 */
import { getSiteSettings } from "@/lib/site-settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFootballProvider } from "@/lib/football";

export interface SyncOptions {
  competitions?: string[];
  daysBack?: number;  // default 1 (the cron runs every 15 minutes, so results come in the same day)
  daysAhead?: number; // default 9 (window max 10 days total) so next weekend shows up during a midweek or an international break
  /** Load this season's finished matches (for the team form bar). One request per league. */
  history?: boolean;
}

export interface SyncResult {
  ok: boolean;
  provider: string;
  competitions: string[];
  window: { dateFrom: string; dateTo: string };
  fetched: number;
  upserted: number;
  errors: string[];
}

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export async function syncMatches(opts: SyncOptions = {}): Promise<SyncResult> {
  // Leagues come from Admin -> Site (falls back to FOOTBALL_COMPETITIONS).
  const competitions =
    opts.competitions && opts.competitions.length > 0 ? opts.competitions : (await getSiteSettings()).competitions;

  const daysBack = Math.min(Math.max(opts.daysBack ?? 1, 0), 10);
  const daysAhead = Math.min(Math.max(opts.daysAhead ?? 9, 0), 10 - daysBack);
  const now = Date.now();
  const dateFrom = isoDate(new Date(now - daysBack * 86_400_000));
  const dateTo = isoDate(new Date(now + daysAhead * 86_400_000));

  const provider = getFootballProvider();
  const { matches, errors } = await provider.fetchMatches({ competitions, dateFrom, dateTo, finishedOnly: opts.history });

  // round_id is deliberately left out so assigned matches stay in their round.
  const rows = matches.map((m) => ({
    provider: provider.name,
    external_id: m.externalId,
    competition: m.competition,
    home_team: m.homeTeam,
    away_team: m.awayTeam,
    home_crest: m.homeCrest,
    away_crest: m.awayCrest,
    kickoff_at: m.kickoffAt,
    status: m.status,
    actual_home_score: m.homeScore,
    actual_away_score: m.awayScore,
    updated_at: new Date().toISOString(),
  }));

  let upserted = 0;
  if (rows.length > 0) {
    const { error, count } = await createAdminClient()
      .from("matches")
      .upsert(rows, { onConflict: "provider,external_id", count: "exact" });
    if (error) errors.push(`database: ${error.message}`);
    else upserted = count ?? rows.length;
  }

  return {
    ok: errors.length === 0,
    provider: provider.name,
    competitions,
    window: { dateFrom, dateTo },
    fetched: matches.length,
    upserted,
    errors,
  };
}
