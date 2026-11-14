/**
 * football-data.org (v4) provider — FREE plan.
 * Free tier: 12 competitions, 10 requests/minute, scores slightly delayed.
 * Docs: https://docs.football-data.org
 */
import type { FootballProvider, MatchStatus, NormalizedMatch } from "../types";

const API_BASE = "https://api.football-data.org/v4";

interface FdTeam { name: string | null; shortName: string | null; crest: string | null }
interface FdMatch {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string; name: string };
  homeTeam: FdTeam;
  awayTeam: FdTeam;
  score: { fullTime: { home: number | null; away: number | null }; halfTime?: { home: number | null; away: number | null } };
}

function mapStatus(s: string): MatchStatus {
  switch (s) {
    case "IN_PLAY": case "PAUSED": case "LIVE": return "live";
    case "FINISHED": case "AWARDED": return "finished";
    case "POSTPONED": case "SUSPENDED": return "postponed";
    case "CANCELLED": return "cancelled";
    default: return "scheduled"; // SCHEDULED, TIMED
  }
}

export function footballDataProvider(apiKey: string): FootballProvider {
  return {
    name: "football-data",

    async fetchMatches({ competitions, dateFrom, dateTo, finishedOnly }) {
      const matches: NormalizedMatch[] = [];
      const errors: string[] = [];

      for (const code of competitions) {
        const url = finishedOnly
          ? `${API_BASE}/competitions/${code}/matches?status=FINISHED`
          : `${API_BASE}/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`;
        const res = await fetch(url, { headers: { "X-Auth-Token": apiKey }, cache: "no-store" });
        if (!res.ok) {
          errors.push(`${code}: HTTP ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
          continue;
        }
        const body = (await res.json()) as { matches?: FdMatch[] };

        for (const m of body.matches ?? []) {
          if (!m.homeTeam?.name || !m.awayTeam?.name) continue; // TBD knockout slots
          const status = mapStatus(m.status);
          matches.push({
            externalId: m.id,
            competition: m.competition?.name ?? null,
            homeTeam: m.homeTeam.shortName ?? m.homeTeam.name,
            awayTeam: m.awayTeam.shortName ?? m.awayTeam.name,
            homeCrest: m.homeTeam.crest,
            awayCrest: m.awayTeam.crest,
            kickoffAt: m.utcDate,
            status,
            homeScore: status === "finished" ? m.score.fullTime.home : null,
            awayScore: status === "finished" ? m.score.fullTime.away : null,
            htHomeScore: status === "finished" ? (m.score.halfTime?.home ?? null) : null,
            htAwayScore: status === "finished" ? (m.score.halfTime?.away ?? null) : null,
          });
        }
      }
      return { matches, errors };
    },
  };
}
