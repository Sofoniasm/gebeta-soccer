/**
 * Personal round recap: one message per player after a round is settled,
 * in their bot language. Pure (no database), so it is easy to test.
 */
import { formatUnits } from "@/lib/money";

export type Lang = "en" | "am";

export interface RecapStanding {
  slipId: string;
  rank: number;
  totalPoints: number;
  exactScores: number;
  correctResults: number;
}
export interface RecapPick { id: number; slip_id: number; match_id: number; home: number; away: number }
export interface RecapMatch { home_team: string; away_team: string; actual_home_score: number | null; actual_away_score: number | null }

export interface RecapInput {
  roundName: string;
  standings: RecapStanding[];
  slips: Map<string, { user_id: string; slip_no: number }>;
  picks: RecapPick[];
  pointsByPick: Map<number, number>;
  matches: Map<number, RecapMatch>;
  payoutBySlip: Map<string, number>;
  langOf: (userId: string) => Lang;
}

export interface RecapNote { user_id: string; kind: string; title: string; body: string; link: string }

export function ordinal(n: number): string {
  const t = n % 100;
  if (t >= 11 && t <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

const pts = (n: number) => String(Math.round(n * 10) / 10);

export function buildRoundRecaps(input: RecapInput): RecapNote[] {
  const total = input.standings.length;
  const byUser = new Map<string, RecapStanding[]>();
  for (const s of input.standings) {
    const slip = input.slips.get(s.slipId);
    if (!slip) continue;
    byUser.set(slip.user_id, [...(byUser.get(slip.user_id) ?? []), s]);
  }
  const picksBySlip = new Map<string, RecapPick[]>();
  for (const p of input.picks) picksBySlip.set(String(p.slip_id), [...(picksBySlip.get(String(p.slip_id)) ?? []), p]);

  const notes: RecapNote[] = [];
  for (const [userId, mine] of byUser) {
    const am = input.langOf(userId) === "am";
    mine.sort((a, b) => a.rank - b.rank || b.totalPoints - a.totalPoints);
    const best = mine[0];
    const bestNo = input.slips.get(best.slipId)!.slip_no;
    const won = mine.reduce((sum, s) => sum + (input.payoutBySlip.get(s.slipId) ?? 0), 0);

    // Best call: the highest-scoring pick on any of the player's slips.
    let call: { p: RecapPick; points: number } | null = null;
    for (const s of mine) {
      for (const p of picksBySlip.get(s.slipId) ?? []) {
        const points = input.pointsByPick.get(p.id) ?? 0;
        if (points > 0 && (!call || points > call.points)) call = { p, points };
      }
    }
    let callText = "";
    if (call) {
      const m = input.matches.get(call.p.match_id);
      if (m) {
        const pick = `${m.home_team} ${call.p.home}-${call.p.away} ${m.away_team}`;
        const final = `${m.actual_home_score}-${m.actual_away_score}`;
        const kind =
          call.points >= 3 ? (am ? "ትክክለኛ ውጤት!" : "exact!") : call.points >= 1.5 ? (am ? `ቅርብ፣ ውጤቱ ${final}` : `close, it ended ${final}`) : am ? `ትክክለኛ አሸናፊ፣ ውጤቱ ${final}` : `right result, it ended ${final}`;
        callText = am ? ` ምርጥ ግምትዎ፦ ${pick} (${kind})።` : ` Best call: ${pick} (${kind}).`;
      }
    }

    const many = mine.length > 1;
    let body: string;
    if (am) {
      body =
        `${many ? `ምርጥ ስሊፕዎ (#${bestNo})` : `ስሊፕዎ`} ከ${total} ውስጥ ${best.rank}ኛ ወጥቷል፣ ${pts(best.totalPoints)} ነጥብ (${best.exactScores} ትክክለኛ ውጤት፣ ${best.correctResults} ትክክለኛ አሸናፊ)።` +
        callText +
        (won > 0 ? ` 🎉 ${formatUnits(won)} አሸንፈዋል፣ ዋሌትዎ ላይ ገብቷል።` : " በዚህ ዙር ሽልማት የለም።") +
        " ለቀጣዩ ዙር ዝግጁ ነዎት? ግምቶችዎን በዳሽቦርድ ላይ ያስገቡ።";
    } else {
      body =
        `${many ? `Your best slip (#${bestNo})` : "Your slip"} finished ${ordinal(best.rank)} of ${total} with ${pts(best.totalPoints)} points (${best.exactScores} exact, ${best.correctResults} correct results).` +
        callText +
        (won > 0 ? ` 🎉 You won ${formatUnits(won)}, it's in your wallet.` : " No prize this time.") +
        " Ready for the next round? Make your picks on the Dashboard.";
    }
    notes.push({
      user_id: userId,
      kind: "round_result",
      title: am ? `🏆 ${input.roundName} ተጠናቋል` : `🏆 ${input.roundName} settled`,
      body,
      link: "/results",
    });
  }
  return notes;
}
