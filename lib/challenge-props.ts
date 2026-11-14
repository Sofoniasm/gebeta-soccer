/**
 * Extra picks ("prop picks") for private challenges — client + server, pure.
 * Mirror of public.calc_prop_points() in supabase/migrations/0040_challenge_props.sql.
 * Each right answer is +1 point on top of the score points (3 / 1.5 / 1 / 0).
 */
export type PropKey = "btts" | "ou25" | "ht";
export type HtResult = "H" | "D" | "A";

export const PROP_KEYS: PropKey[] = ["btts", "ou25", "ht"];

export const PROP_INFO: Record<PropKey, { label: string; short: string; help: string }> = {
  btts: { label: "Both teams to score", short: "BTTS", help: "Will both teams score at least one goal?" },
  ou25: { label: "Over / Under 2.5 goals", short: "O/U 2.5", help: "3 or more goals = Over, 0 to 2 = Under." },
  ht: { label: "Half-time result", short: "HT", help: "Who leads at half-time (or a draw)?" },
};

export interface PropPick {
  btts?: boolean | null;
  over25?: boolean | null;
  ht?: HtResult | null;
}

export const isPropKey = (k: unknown): k is PropKey => typeof k === "string" && (PROP_KEYS as string[]).includes(k);

/** Clean list from user input: known keys only, no duplicates, fixed order. */
export function normalizeProps(keys: readonly unknown[] | null | undefined): PropKey[] {
  const set = new Set((keys ?? []).filter(isPropKey));
  return PROP_KEYS.filter((k) => set.has(k));
}

export const htOf = (home: number, away: number): HtResult => (home > away ? "H" : home < away ? "A" : "D");

/**
 * Points for the extra picks of one match. Missing answers or missing scores
 * give 0 (a missing half-time score voids only the half-time pick, for everyone).
 */
export function propPoints(
  pick: PropPick,
  ft: { home: number | null; away: number | null },
  ht: { home: number | null; away: number | null },
): number {
  let pts = 0;
  if (ft.home !== null && ft.away !== null) {
    if (typeof pick.btts === "boolean" && pick.btts === (ft.home > 0 && ft.away > 0)) pts += 1;
    if (typeof pick.over25 === "boolean" && pick.over25 === ft.home + ft.away > 2) pts += 1;
  }
  if (pick.ht && ht.home !== null && ht.away !== null && pick.ht === htOf(ht.home, ht.away)) pts += 1;
  return pts;
}

/** Sensible starting answers from a score pick (the player can still change them). */
export function propsFromScore(home: number, away: number): { btts: boolean; over25: boolean } {
  return { btts: home > 0 && away > 0, over25: home + away > 2 };
}

/** Is every switched-on extra pick answered? */
export function propsComplete(props: readonly PropKey[], pick: PropPick): boolean {
  return props.every((k) =>
    k === "btts" ? typeof pick.btts === "boolean" : k === "ou25" ? typeof pick.over25 === "boolean" : pick.ht === "H" || pick.ht === "D" || pick.ht === "A",
  );
}

/** Short text of a player's extra picks, e.g. "BTTS Yes · Over · HT Home". */
export function propSummary(props: readonly PropKey[], pick: PropPick, home = "Home", away = "Away"): string {
  const parts: string[] = [];
  if (props.includes("btts") && typeof pick.btts === "boolean") parts.push(`BTTS ${pick.btts ? "Yes" : "No"}`);
  if (props.includes("ou25") && typeof pick.over25 === "boolean") parts.push(pick.over25 ? "Over" : "Under");
  if (props.includes("ht") && pick.ht) parts.push(`HT ${pick.ht === "H" ? home : pick.ht === "A" ? away : "Draw"}`);
  return parts.join(" · ");
}
