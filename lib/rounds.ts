// Data helpers shared by the landing page, dashboard and admin panel.
// Works with both the user (SSR) client and the admin client. Typed loosely
// because their generic parameters differ between @supabase packages.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

export interface RoundRow {
  id: number;
  name: string;
  status: "draft" | "open" | "locked" | "settled" | "cancelled";
  entry_fee_units: number;
  house_cut: number;
  created_at: string;
  settled_at: string | null;
}

export interface MatchRow {
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
}

export interface PoolInfo {
  entrants: number;
  pool_units: number;
  prize_fund_units: number;
}

/** The round players should see: newest open/locked one, else newest settled. */
export async function getCurrentRound(supabase: SupabaseClient): Promise<RoundRow | null> {
  const { data: active } = await supabase
    .from("rounds")
    .select("*")
    .in("status", ["open", "locked"])
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) return active as RoundRow;

  const { data: last } = await supabase
    .from("rounds")
    .select("*")
    .eq("status", "settled")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (last as RoundRow) ?? null;
}

export async function getRoundMatches(supabase: SupabaseClient, roundId: number): Promise<MatchRow[]> {
  const { data } = await supabase
    .from("matches")
    .select("*")
    .eq("round_id", roundId)
    .order("kickoff_at", { ascending: true });
  return (data ?? []) as MatchRow[];
}

export async function getRoundPool(supabase: SupabaseClient, roundId: number): Promise<PoolInfo> {
  const { data } = await supabase.rpc("get_round_pool", { p_round_id: roundId }).maybeSingle();
  const p = (data ?? {}) as Partial<PoolInfo>;
  return {
    entrants: Number(p.entrants ?? 0),
    pool_units: Number(p.pool_units ?? 0),
    prize_fund_units: Number(p.prize_fund_units ?? 0),
  };
}

/** A match accepts predictions until kickoff. */
export function isMatchOpen(m: MatchRow, now = Date.now()): boolean {
  return m.status === "scheduled" && new Date(m.kickoff_at).getTime() > now;
}
