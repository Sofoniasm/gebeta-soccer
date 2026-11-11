import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { calculateMatchPoints } from "@/lib/scoring";
import { ETB_PER_UNIT } from "@/lib/money";

export interface CareerRound {
  round_id: number;
  round_name: string;
  status: string;
  played_at: string;
  rank: number | null;
  players: number;
  points: number;
  slam_points: number;
  correct_results: number;
  exact_scores: number;
  close_picks: number;
  predicted: number;
  winnings_units: number;
}

export interface GradedPick {
  roundId: number | null;
  home: number;
  away: number;
  actualHome: number;
  actualAway: number;
  points: number;
  isDefault: boolean;
}

export interface Career {
  rounds: CareerRound[];
  settled: CareerRound[];
  picks: GradedPick[];
  totals: {
    roundsPlayed: number;
    caps: number; // picks made (not defaults)
    points: number;
    exact: number;
    close: number;
    correct: number;
    graded: number;
    accuracy: number; // % correct results of graded picks
    wins: number;
    podiums: number;
    bestRank: { rank: number; players: number; round: string } | null;
    winningsUnits: number;
    avgPoints: number;
  };
}

export const getCareer = cache(async (userId: string): Promise<Career> => {
  const supabase = await createClient();
  const [{ data: rows }, { data: preds }] = await Promise.all([
    supabase.rpc("get_my_career"),
    supabase
      .from("predictions")
      .select("predicted_home_score, predicted_away_score, points_earned, is_default, matches(round_id, status, actual_home_score, actual_away_score)")
      .eq("user_id", userId)
      .limit(5000),
  ]);

  const rounds: CareerRound[] = ((rows ?? []) as CareerRound[]).map((r) => ({
    ...r,
    rank: r.rank === null ? null : Number(r.rank),
    players: Number(r.players),
    points: Number(r.points),
    slam_points: Number(r.slam_points),
    correct_results: Number(r.correct_results),
    exact_scores: Number(r.exact_scores),
    close_picks: Number(r.close_picks),
    predicted: Number(r.predicted),
    winnings_units: Number(r.winnings_units),
  }));
  const settled = rounds.filter((r) => r.status === "settled");

  type P = {
    predicted_home_score: number;
    predicted_away_score: number;
    points_earned: number | null;
    is_default: boolean;
    matches: { round_id: number | null; status: string; actual_home_score: number | null; actual_away_score: number | null } | null;
  };
  const all = (preds ?? []) as unknown as P[];
  const picks: GradedPick[] = all
    .filter((p) => p.matches?.status === "finished" && p.matches.actual_home_score !== null && p.matches.actual_away_score !== null)
    .map((p) => {
      const m = p.matches!;
      return {
        roundId: m.round_id,
        home: p.predicted_home_score,
        away: p.predicted_away_score,
        actualHome: m.actual_home_score!,
        actualAway: m.actual_away_score!,
        points:
          p.points_earned !== null
            ? Number(p.points_earned)
            : calculateMatchPoints(p.predicted_home_score, p.predicted_away_score, m.actual_home_score!, m.actual_away_score!),
        isDefault: p.is_default,
      };
    });

  const exact = picks.filter((p) => p.points === 3).length;
  const close = picks.filter((p) => p.points === 1.5).length;
  const correct = picks.filter((p) => p.points > 0).length;
  const points = rounds.reduce((s, r) => s + r.points, 0);
  const ranked = settled.filter((r) => r.rank !== null);
  const best = ranked.reduce<CareerRound | null>((b, r) => (!b || r.rank! < b.rank! ? r : b), null);

  return {
    rounds,
    settled,
    picks,
    totals: {
      roundsPlayed: rounds.length,
      caps: all.filter((p) => !p.is_default).length,
      points,
      exact,
      close,
      correct,
      graded: picks.length,
      accuracy: picks.length ? Math.round((correct / picks.length) * 100) : 0,
      wins: settled.filter((r) => r.winnings_units > 0).length,
      podiums: ranked.filter((r) => r.rank! <= 3).length,
      bestRank: best ? { rank: best.rank!, players: best.players, round: best.round_name } : null,
      winningsUnits: rounds.reduce((s, r) => s + r.winnings_units, 0),
      avgPoints: rounds.length ? Math.round((points / rounds.length) * 10) / 10 : 0,
    },
  };
});

export interface Certificate {
  id: string;
  emoji: string;
  name: string;
  how: string;
  earned: boolean;
  progress?: { have: number; need: number };
}

/** Superbru-style certificates, worked out from the player's own record. */
export function certificatesFor(c: Career): Certificate[] {
  const t = c.totals;
  const bestRound = (f: (r: CareerRound) => number) => c.rounds.reduce((m, r) => Math.max(m, f(r)), 0);
  const maxExactInRound = bestRound((r) => r.exact_scores);
  const maxCorrectInRound = bestRound((r) => r.correct_results);
  const draws = c.picks.filter((p) => !p.isDefault && p.home === p.away && p.actualHome === p.actualAway).length;
  const longShot = c.picks.some((p) => !p.isDefault && p.points === 3 && p.actualHome + p.actualAway >= 5);
  const winningsEtb = t.winningsUnits * ETB_PER_UNIT;

  const step = (id: string, emoji: string, name: string, how: string, have: number, need: number): Certificate => ({
    id,
    emoji,
    name,
    how,
    earned: have >= need,
    progress: { have: Math.min(have, need), need },
  });

  return [
    step("first-whistle", "🎽", "First Whistle", "Join your first round", t.roundsPlayed, 1),
    step("bullseye", "🎯", "Bullseye", "Predict an exact score", t.exact, 1),
    step("sharpshooter", "🔫", "Sharpshooter", "3 exact scores in one round", maxExactInRound, 3),
    step("slam", "💥", "Slam", "5 correct results in one round", maxCorrectInRound, 5),
    step("super-slam", "⚡", "Super Slam", "8 correct results in one round", maxCorrectInRound, 8),
    step("grand-slam", "👑", "Grand Slam", "All 10 results correct in one round", maxCorrectInRound, 10),
    step("podium", "🥉", "Podium", "Finish in the top 3 of a round", t.podiums, 1),
    step("champion", "🏆", "Champion", "Win a round's prize", t.wins, 1),
    step("draw-master", "🤝", "Draw Master", "Correctly call 5 draws", draws, 5),
    {
      id: "long-shot",
      emoji: "🚀",
      name: "Long Shot",
      how: "Exact score in a match with 5+ goals",
      earned: longShot,
    },
    step("crystal-ball", "🔮", "Crystal Ball", "10 exact scores in your career", t.exact, 10),
    step("regular", "📅", "Regular", "Play 5 rounds", t.roundsPlayed, 5),
    step("veteran", "🎖️", "Veteran", "Play 20 rounds", t.roundsPlayed, 20),
    step("century", "💯", "Century", "Make 100 picks", t.caps, 100),
    step("big-winner", "💰", "Big Winner", "Win 10,000 ETB in total", Math.floor(winningsEtb), 10000),
  ];
}
