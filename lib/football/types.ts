/**
 * Provider-neutral match format.
 * ---------------------------------------------------------------
 * Every data source (football-data.org today; API-Football,
 * Sportmonks, etc. later) converts its own response into this shape.
 * The rest of the app — database, scoring, settlement — only ever
 * sees NormalizedMatch, so switching provider never changes game logic.
 */

export type MatchStatus = "scheduled" | "live" | "finished" | "postponed" | "cancelled";

export interface NormalizedMatch {
  /** The provider's own match id (stored with the provider name). */
  externalId: number;
  competition: string | null;
  homeTeam: string;
  awayTeam: string;
  homeCrest: string | null;
  awayCrest: string | null;
  kickoffAt: string; // ISO 8601, UTC
  status: MatchStatus;
  /** Full-time score; null until the match is finished. */
  homeScore: number | null;
  awayScore: number | null;
  /** Half-time score; null until the match is finished (or if the provider has none). */
  htHomeScore?: number | null;
  htAwayScore?: number | null;
}

export interface FetchMatchesOptions {
  /** Provider-specific competition codes, e.g. ["PL", "CL"]. */
  competitions: string[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  /** Ignore the dates and fetch every finished match of the season (one request per league). */
  finishedOnly?: boolean;
}

export interface FootballProvider {
  /** Short id, e.g. "football-data". */
  name: string;
  fetchMatches(opts: FetchMatchesOptions): Promise<{
    matches: NormalizedMatch[];
    errors: string[];
  }>;
}
