/**
 * Picks the football data provider from the FOOTBALL_PROVIDER env var.
 *
 * To add a new source later (e.g. API-Football when we go paid):
 *   1. Create lib/football/providers/api-football.ts that returns NormalizedMatch[]
 *   2. Add a case below
 *   3. Set FOOTBALL_PROVIDER=api-football in Vercel
 * Nothing else in the app needs to change.
 */
import type { FootballProvider } from "./types";
import { footballDataProvider } from "./providers/football-data";

export * from "./types";

export function getFootballProvider(): FootballProvider {
  const provider = (process.env.FOOTBALL_PROVIDER ?? "football-data").toLowerCase();

  switch (provider) {
    case "football-data": {
      const key = process.env.FOOTBALL_DATA_API_KEY;
      if (!key) throw new Error("FOOTBALL_DATA_API_KEY is not set");
      return footballDataProvider(key);
    }
    // case "api-football": return apiFootballProvider(process.env.API_FOOTBALL_KEY!);
    default:
      throw new Error(`Unknown FOOTBALL_PROVIDER "${provider}"`);
  }
}
