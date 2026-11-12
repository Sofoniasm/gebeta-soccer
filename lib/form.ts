/**
 * Team form: the last 5 finished results of each team, from matches we have
 * synced (all followed leagues and cups). Pure helpers + one database read.
 */

export type Outcome = "W" | "D" | "L";
export interface FormItem {
  r: Outcome;
  /** "2-1 vs Chelsea (H) · 8 Nov" */
  t: string;
}
export type FormMap = Record<string, FormItem[]>;

interface Finished {
  home_team: string;
  away_team: string;
  actual_home_score: number;
  actual_away_score: number;
  kickoff_at: string;
}

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short" }).format(new Date(iso));

/** Last `n` results per team, oldest first (newest on the right). `list` may be in any order. */
export function buildForm(teams: string[], list: Finished[], n = 5): FormMap {
  const sorted = [...list].sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));
  const out: FormMap = {};
  for (const team of teams) {
    const items: FormItem[] = [];
    for (const m of sorted) {
      if (items.length >= n) break;
      const home = m.home_team === team;
      if (!home && m.away_team !== team) continue;
      const mine = home ? m.actual_home_score : m.actual_away_score;
      const theirs = home ? m.actual_away_score : m.actual_home_score;
      const r: Outcome = mine > theirs ? "W" : mine === theirs ? "D" : "L";
      items.push({ r, t: `${mine}-${theirs} vs ${home ? m.away_team : m.home_team} (${home ? "H" : "A"}) · ${day(m.kickoff_at)}` });
    }
    out[team] = items.reverse();
  }
  return out;
}

export interface Chances { home: number; draw: number; away: number }

/**
 * Premium form guide: a rough chance of each result from the last 5 results
 * (3 points a win, 1 a draw) plus home advantage. Needs 3+ results per team.
 */
export function formChances(home: FormItem[], away: FormItem[]): Chances | null {
  if (home.length < 3 || away.length < 3) return null;
  const ppg = (f: FormItem[]) => f.reduce((s, x) => s + (x.r === "W" ? 3 : x.r === "D" ? 1 : 0), 0) / f.length;
  const d = (ppg(home) - ppg(away)) / 3; // -1 .. 1
  let h = 0.45 + 0.25 * d;
  let a = 0.29 - 0.22 * d;
  h = Math.min(0.85, Math.max(0.06, h));
  a = Math.min(0.85, Math.max(0.06, a));
  let dr = 1 - h - a;
  if (dr < 0.08) {
    const cut = (0.08 - dr) / 2;
    h -= cut;
    a -= cut;
    dr = 0.08;
  }
  const H = Math.round(h * 100);
  const A = Math.round(a * 100);
  return { home: H, draw: 100 - H - A, away: A };
}

/** Load form for the teams of these matches. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getForm(supabase: any, teams: string[]): Promise<FormMap> {
  const names = [...new Set(teams)].filter(Boolean);
  if (names.length === 0) return {};
  const list = names.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",");
  const { data } = await supabase
    .from("matches")
    .select("home_team, away_team, actual_home_score, actual_away_score, kickoff_at")
    .eq("status", "finished")
    .not("actual_home_score", "is", null)
    .not("actual_away_score", "is", null)
    .lt("kickoff_at", new Date().toISOString())
    .or(`home_team.in.(${list}),away_team.in.(${list})`)
    .order("kickoff_at", { ascending: false })
    .limit(Math.min(40 * names.length, 1000));
  return buildForm(names, (data ?? []) as Finished[]);
}
