/**
 * Match prediction pages (/predictions/<home>-vs-<away>-<id>): URL helpers,
 * types and the rule for which pages Google may index.
 */
import { slugify } from "@/lib/news";

export interface PredictionMatch {
  id: number;
  round_id: number | null;
  competition: string | null;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  kickoff_at: string;
  status: "scheduled" | "live" | "finished" | "postponed" | "cancelled";
  actual_home_score: number | null;
  actual_away_score: number | null;
  updated_at?: string;
}

export interface MatchPreview {
  match_id: number;
  pick_home: number;
  pick_away: number;
  confidence: "low" | "medium" | "high";
  verdict: string;
  body: string;
  verdict_am?: string | null;
  body_am?: string | null;
  is_published?: boolean;
  updated_at: string;
  created_at?: string;
}

export interface PickSplit {
  picks: number;
  home_win: number | null;
  draw: number | null;
  away_win: number | null;
  top_score: string | null;
  top_score_pct: number | null;
}

export const MATCH_COLS =
  "id, round_id, competition, home_team, away_team, home_crest, away_crest, kickoff_at, status, actual_home_score, actual_away_score, updated_at";

/** "/predictions/arsenal-vs-chelsea-1234" */
export function predictionPath(m: { id: number; home_team: string; away_team: string }): string {
  const teams = `${slugify(m.home_team) || "home"}-vs-${slugify(m.away_team) || "away"}`.slice(0, 90);
  return `/predictions/${teams}-${m.id}`;
}

/** The match id is always the last number in the slug. */
export function idFromSlug(slug: string): number | null {
  const m = slug.match(/-(\d+)$/) ?? slug.match(/^(\d+)$/);
  const id = m ? Number(m[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/**
 * Only pages with real content are indexed: a written preview, or a match in
 * one of our weekly rounds (it then has player picks and results). Every
 * other fixture page still works for visitors but tells Google "noindex".
 */
export function isIndexable(m: PredictionMatch, preview: MatchPreview | null, roundIsLive: boolean): boolean {
  return Boolean(preview) || (m.round_id !== null && roundIsLive);
}

export const CONFIDENCE_LABEL = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" } as const;

/** "Arsenal win" / "Draw" / "Chelsea win" for a score. */
export function outcomeText(home: number, away: number, m: { home_team: string; away_team: string }): string {
  return home > away ? `${m.home_team} win` : home < away ? `${m.away_team} win` : "a draw";
}
