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
  auto_settle?: boolean;
  /** Set on rounds the system made by itself: morning | evening | night (EAT). */
  auto_slot?: string | null;
  auto_date?: string | null;
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
  /** number of slips placed */
  entrants: number;
  /** distinct players */
  players: number;
  pool_units: number;
  prize_fund_units: number;
}

/** Ids of rounds made of admin test matches (provider "test"). Never shown to the public. */
export async function testRoundIds(supabase: SupabaseClient, roundIds: number[]): Promise<Set<number>> {
  if (roundIds.length === 0) return new Set();
  const { data } = await supabase.from("matches").select("round_id").eq("provider", "test").in("round_id", roundIds);
  return new Set(((data ?? []) as { round_id: number }[]).map((m) => m.round_id));
}

/** The round players should see: newest open/locked one, else newest settled (test rounds only for admins). */
export async function getCurrentRound(supabase: SupabaseClient, opts: { includeTest?: boolean } = {}): Promise<RoundRow | null> {
  for (const statuses of [["open", "locked"], ["settled"]]) {
    const { data } = await supabase.from("rounds").select("*").in("status", statuses).order("id", { ascending: false }).limit(10);
    const list = (data ?? []) as RoundRow[];
    const test = opts.includeTest ? new Set<number>() : await testRoundIds(supabase, list.map((r) => r.id));
    const pick = list.find((r) => !test.has(r.id));
    if (pick) return pick;
  }
  return null;
}

export interface ActiveRound extends RoundRow {
  /** First kickoff (the whole round locks then). */
  lock_at: string | null;
  /** Still taking slips. */
  bettable: boolean;
}

/**
 * All rounds players can see right now (open or locked), for daily rounds that
 * run side by side. Order: still taking slips (closing soonest first), then
 * rounds in play.
 */
export async function getActiveRounds(supabase: SupabaseClient, opts: { includeTest?: boolean } = {}): Promise<ActiveRound[]> {
  const { data } = await supabase.from("rounds").select("*").in("status", ["open", "locked"]).order("id", { ascending: false }).limit(20);
  const rounds = (data ?? []) as RoundRow[];
  if (rounds.length === 0) return [];
  const { data: ms } = await supabase
    .from("matches")
    .select("round_id, kickoff_at, status, provider")
    .in("round_id", rounds.map((r) => r.id));
  const lock = new Map<number, string>();
  const count = new Map<number, number>();
  const testRounds = new Set<number>();
  for (const m of (ms ?? []) as { round_id: number; kickoff_at: string; status: string; provider: string }[]) {
    if (m.provider === "test") testRounds.add(m.round_id);
    count.set(m.round_id, (count.get(m.round_id) ?? 0) + 1);
    if (["postponed", "cancelled"].includes(m.status)) continue;
    const cur = lock.get(m.round_id);
    if (!cur || m.kickoff_at < cur) lock.set(m.round_id, m.kickoff_at);
  }
  const now = Date.now();
  // Rounds made of test matches are for admins only, never shown to the public.
  const list = rounds.filter((r) => opts.includeTest || !testRounds.has(r.id)).map((r) => {
    const lock_at = lock.get(r.id) ?? null;
    const bettable = r.status === "open" && count.get(r.id) === 10 && !!lock_at && new Date(lock_at).getTime() > now;
    return { ...r, lock_at, bettable };
  });
  const t = (x: ActiveRound) => (x.lock_at ? new Date(x.lock_at).getTime() : Number.MAX_SAFE_INTEGER);
  return list.sort((a, b) => Number(b.bettable) - Number(a.bettable) || (a.bettable ? t(a) - t(b) : t(b) - t(a)));
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
    players: Number(p.players ?? 0),
    pool_units: Number(p.pool_units ?? 0),
    prize_fund_units: Number(p.prize_fund_units ?? 0),
  };
}

/** A match accepts predictions until kickoff. */
export function isMatchOpen(m: MatchRow, now = Date.now()): boolean {
  return m.status === "scheduled" && new Date(m.kickoff_at).getTime() > now;
}
