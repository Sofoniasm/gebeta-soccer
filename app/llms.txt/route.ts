import { SITE_URL } from "@/lib/site";
import { getSiteSettings } from "@/lib/site-settings";

// Rebuilt at most every hour so admin changes (Telegram link) show up.
export const revalidate = 3600;

/** /llms.txt — a plain summary of GebetaSoccer for AI assistants (llmstxt.org format). */
export async function GET() {
  const TELEGRAM_URL = (await getSiteSettings()).telegram_support;
  const body = `# GebetaSoccer

> GebetaSoccer (${SITE_URL}) is a daily football score-prediction game for players in Ethiopia (18+). Each round has exactly 10 big matches (Premier League and other top competitions), with new rounds every day. Players predict the score of every match, earn points for accuracy, and the best slip with more than half the points wins the prize pool, paid in Ethiopian birr (ETB).

## How it works
- Each round has exactly 10 matches. Players fill a slip with a score for all 10 matches and pay the entry fee when placing it. Several slips per round are allowed; each is paid and ranked separately.
- The whole round locks at its first kickoff: slips can be edited free until then; no refunds.
- Scoring per match: exact score = 3 points; "close" (right result and 1 goal away, or 2 goals away with the same goal difference, e.g. 1-1 vs 2-2) = 1.5; correct result = 1; wrong = 0.
- Slam Points per round: 5-7 correct results +1, 8-9 correct +2, all 10 correct +3.
- Tie-breaks: most correct results, then most exact scores, then most close picks, then smallest total goal difference. Players still tied share the prize.
- Prize: the round winner(s) receive 70% of the entry pool; 30% is the house fee.
- Winning bar: a slip must score more than half the match points available (more than 15 of 30; Slam Points not counted) to win. If no slip clears it, there is no winner and the house keeps the pool.
- Everyone's slips are hidden until the round locks, then visible on the match page.

## Money
- 1 Unit = 200 ETB. Typical round entry: 1 Unit.
- Deposits: 1,000-100,000 ETB per transaction, paid via Telebirr and confirmed by the admin on Telegram (${TELEGRAM_URL}).
- Withdrawals: any amount; 1 Unit always stays in the account. Paid to the player's Telebirr number after review.

## Private leagues
- Any player can create a free league (bragging rights) or a paid league (5-50 Units per player, winner takes 70% of the league pot if they score more than 15 of 30 match points, otherwise the house keeps it) and invite friends with a link or code.

## Match predictions
- ${SITE_URL}/predictions lists this week's matches with GebetaSoccer score tips and kickoff times in Ethiopia time (EAT).
- Each match has its own page at ${SITE_URL}/predictions/<home>-vs-<away>-<id> with our predicted score, a short reason, and (after kickoff) how GebetaSoccer players predicted it.

## Languages
- English at ${SITE_URL}, Amharic (አማርኛ) at ${SITE_URL}/am for the home page, ${SITE_URL}/am/how-to-play, ${SITE_URL}/am/terms and all match predictions (${SITE_URL}/am/predictions).

## Private challenges
- Any player can create a challenge: pick 1-10 upcoming matches, set a stake per player (200 to 1,000,000 ETB) and share an invite link or code (GC-XXXXXX).
- Everyone who joins pays the same stake from their wallet and predicts the same matches (same 3 / 1.5 / 1 scoring). Picks are hidden until the first kickoff.
- The highest score wins 90% of all stakes (ties share); GebetaSoccer keeps 10%. If nobody else joins before the first kickoff, the stake is refunded.

## Account & safety
- Sign up with an Ethiopian mobile number and password; the number is confirmed with the Telegram bot.
- Also available as a Telegram Mini App with the same account.
- 18+ only. Play responsibly: only play with money you can afford to lose.

## Key pages
- [Home](${SITE_URL}/): overview, current prize pool, featured matches
- [How to play](${SITE_URL}/how-to-play): rules, scoring and FAQ
- [Tournaments](${SITE_URL}/tournaments): competitions covered
- [News](${SITE_URL}/news): guides and announcements
- [Get the app](${SITE_URL}/apps): install on Android, iPhone or use in Telegram
- [About](${SITE_URL}/about)
- [Terms & responsible play](${SITE_URL}/terms)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
