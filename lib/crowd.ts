/**
 * Crowd picks per match: how many main-pool picks, and the home / draw / away
 * split when the player may see it (Premium before kickoff, everyone after,
 * 5+ picks). Rules live in public.get_matches_crowd (0050).
 */
export interface CrowdInfo {
  picks: number;
  /** null = hidden (not Premium before kickoff, or fewer than 5 picks). */
  home: number | null;
  draw: number | null;
  away: number | null;
}
export type CrowdMap = Record<number, CrowdInfo>;

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function toCrowdMap(rows: { match_id: number | string; picks: number | string; home_pct: unknown; draw_pct: unknown; away_pct: unknown }[]): CrowdMap {
  const out: CrowdMap = {};
  for (const r of rows) {
    out[Number(r.match_id)] = { picks: Number(r.picks), home: num(r.home_pct), draw: num(r.draw_pct), away: num(r.away_pct) };
  }
  return out;
}

/** Load crowd picks for these matches. Never throws: no data = empty map. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMatchesCrowd(supabase: any, matchIds: number[]): Promise<CrowdMap> {
  const ids = [...new Set(matchIds)].filter((x) => Number.isFinite(x)).slice(0, 400);
  if (ids.length === 0) return {};
  try {
    const { data, error } = await supabase.rpc("get_matches_crowd", { p_match_ids: ids });
    if (error || !data) return {};
    return toCrowdMap(data);
  } catch {
    return {};
  }
}

/** "Home 62% · Draw 4% · Away 34%" style numbers, or null when hidden. */
export function crowdSplit(c: CrowdInfo | undefined): { home: number; draw: number; away: number } | null {
  if (!c || c.home === null || c.draw === null || c.away === null) return null;
  return { home: c.home, draw: c.draw, away: c.away };
}
