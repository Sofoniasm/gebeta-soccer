import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { MatchRow, RoundRow } from "@/lib/rounds";

export interface TodoPick {
  match: MatchRow;
  round: RoundRow;
}

export type TodoRound = RoundRow & { lockAt: string };

export interface Todo {
  /** Open rounds (still before the first kickoff) where the player has no slip yet */
  join: TodoRound[];
  /** Kept for compatibility: slips are always complete, so no single picks are ever missing */
  picks: TodoPick[];
  notJoinedMatches: number;
  /** Badge number */
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
  const [{ data: slips }, { data: matches }] = await Promise.all([
    supabase.from("slips").select("round_id").eq("user_id", user.id).in("round_id", ids),
    supabase.from("matches").select("round_id, kickoff_at, status").in("round_id", ids),
  ]);
  const haveSlip = new Set(((slips ?? []) as { round_id: number }[]).map((s) => s.round_id));

  const now = Date.now();
  const join: TodoRound[] = [];
  for (const r of open) {
    const ms = ((matches ?? []) as { round_id: number; kickoff_at: string; status: string }[]).filter(
      (m) => m.round_id === r.id && !["postponed", "cancelled"].includes(m.status),
    );
    if (ms.length === 0) continue;
    const lock = Math.min(...ms.map((m) => new Date(m.kickoff_at).getTime()));
    if (lock > now && !haveSlip.has(r.id)) join.push({ ...r, lockAt: new Date(lock).toISOString() });
  }
  return { join, picks: [], notJoinedMatches: 0, count: join.length };
});

/** Rounds still needing a slip that close within the next `hours`. */
export function picksNeededWithin(todo: Todo, hours: number, now = Date.now()): number {
  const limit = now + hours * 3600_000;
  return todo.join.filter((r) => new Date(r.lockAt).getTime() <= limit).length;
}
