import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MatchRow, RoundRow } from "@/lib/rounds";

export interface TodoPick {
  match: MatchRow;
  round: RoundRow;
}

export interface Todo {
  /** Open rounds the player hasn't joined yet */
  join: RoundRow[];
  /** Matches in joined rounds that still need a pick (kickoff in the future), soonest first */
  picks: TodoPick[];
  /** Open matches in rounds not joined yet (shown as "join to predict") */
  notJoinedMatches: number;
  /** Badge number: picks needed + rounds to join */
  count: number;
}

/** What the signed-in player still has to do (cached per request). */
export const getTodo = cache(async (): Promise<Todo> => {
  const empty: Todo = { join: [], picks: [], notJoinedMatches: 0, count: 0 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return empty;

  const { data: rounds } = await supabase.from("rounds").select("*").eq("status", "open").order("id");
  const open = (rounds ?? []) as RoundRow[];
  if (open.length === 0) return empty;

  const ids = open.map((r) => r.id);
  const nowIso = new Date().toISOString();
  const [{ data: entries }, { data: matches }] = await Promise.all([
    supabase.from("round_entries").select("round_id").eq("user_id", user.id).in("round_id", ids),
    supabase
      .from("matches")
      .select("*")
      .in("round_id", ids)
      .eq("status", "scheduled")
      .gt("kickoff_at", nowIso)
      .order("kickoff_at", { ascending: true }),
  ]);
  const joined = new Set(((entries ?? []) as { round_id: number }[]).map((e) => e.round_id));
  const list = (matches ?? []) as MatchRow[];

  const { data: preds } = list.length
    ? await supabase.from("predictions").select("match_id").eq("user_id", user.id).in("match_id", list.map((m) => m.id))
    : { data: [] };
  const picked = new Set(((preds ?? []) as { match_id: number }[]).map((p) => p.match_id));
  const byId = new Map(open.map((r) => [r.id, r]));

  const picks: TodoPick[] = list
    .filter((m) => m.round_id && joined.has(m.round_id) && !picked.has(m.id))
    .map((m) => ({ match: m, round: byId.get(m.round_id!)! }));
  const join = open.filter((r) => !joined.has(r.id) && list.some((m) => m.round_id === r.id));
  const notJoinedMatches = list.filter((m) => m.round_id && !joined.has(m.round_id)).length;

  return { join, picks, notJoinedMatches, count: picks.length + join.length };
});

/** Picks needed for matches kicking off within the next `hours`. */
export function picksNeededWithin(todo: Todo, hours: number, now = Date.now()): number {
  const limit = now + hours * 3600_000;
  return todo.picks.filter((p) => new Date(p.match.kickoff_at).getTime() <= limit).length;
}
