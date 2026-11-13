/**
 * Facts for an AI-drafted match preview. Only data we really hold (finished
 * matches synced into our database). Nothing about injuries, line-ups or news.
 */

export interface FinishedMatch {
  home_team: string;
  away_team: string;
  actual_home_score: number;
  actual_away_score: number;
  kickoff_at: string;
  competition?: string | null;
}

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

interface Line {
  r: "W" | "D" | "L";
  gf: number;
  ga: number;
  text: string;
}

function linesFor(team: string, list: FinishedMatch[], where: "any" | "home" | "away", n: number): Line[] {
  const out: Line[] = [];
  for (const m of list) {
    if (out.length >= n) break;
    const home = m.home_team === team;
    const away = m.away_team === team;
    if (!home && !away) continue;
    if (where === "home" && !home) continue;
    if (where === "away" && !away) continue;
    const gf = home ? m.actual_home_score : m.actual_away_score;
    const ga = home ? m.actual_away_score : m.actual_home_score;
    const r = gf > ga ? "W" : gf === ga ? "D" : "L";
    out.push({ r, gf, ga, text: `${r} ${gf}-${ga} vs ${home ? m.away_team : m.home_team} (${home ? "home" : "away"}${m.competition ? `, ${m.competition}` : ""}, ${day(m.kickoff_at)})` });
  }
  return out;
}

function summary(lines: Line[]): string {
  const w = lines.filter((l) => l.r === "W").length;
  const d = lines.filter((l) => l.r === "D").length;
  const l = lines.filter((x) => x.r === "L").length;
  const gf = lines.reduce((s, x) => s + x.gf, 0);
  const ga = lines.reduce((s, x) => s + x.ga, 0);
  return `${lines.length} games: ${w}W ${d}D ${l}L, scored ${gf}, conceded ${ga}`;
}

/** Plain-text fact sheet. `list` may be in any order. Sections with no data say so. */
export function buildPreviewFacts(m: { home_team: string; away_team: string; competition: string; kickoff_at: string }, list: FinishedMatch[]): { text: string; games: number } {
  const sorted = [...list].filter((x) => x.kickoff_at < m.kickoff_at).sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at));
  const H = m.home_team;
  const A = m.away_team;
  const parts: string[] = [];
  parts.push(`Match: ${H} (home) vs ${A} (away)`);
  parts.push(`Competition: ${m.competition}`);
  parts.push(`Kickoff: ${new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(m.kickoff_at))} Addis Ababa time`);

  const block = (title: string, lines: Line[]) => {
    parts.push("");
    parts.push(`${title}:`);
    if (lines.length === 0) parts.push("NO DATA - do not mention this.");
    else {
      parts.push(`Summary: ${summary(lines)}`);
      for (const l of lines) parts.push(`- ${l.text}`);
    }
  };

  const hLast = linesFor(H, sorted, "any", 5);
  const aLast = linesFor(A, sorted, "any", 5);
  block(`${H} last 5 results, all competitions (newest first)`, hLast);
  block(`${A} last 5 results, all competitions (newest first)`, aLast);
  block(`${H} last 5 HOME games (newest first)`, linesFor(H, sorted, "home", 5));
  block(`${A} last 5 AWAY games (newest first)`, linesFor(A, sorted, "away", 5));

  const h2h = sorted.filter((x) => (x.home_team === H && x.away_team === A) || (x.home_team === A && x.away_team === H)).slice(0, 5);
  parts.push("");
  parts.push("Previous meetings in our records (newest first):");
  if (h2h.length === 0) parts.push("NO DATA - do not mention head-to-head.");
  for (const x of h2h) parts.push(`- ${x.home_team} ${x.actual_home_score}-${x.actual_away_score} ${x.away_team} (${day(x.kickoff_at)})`);

  return { text: parts.join("\n"), games: hLast.length + aLast.length };
}
