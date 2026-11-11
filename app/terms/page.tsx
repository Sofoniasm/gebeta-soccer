import Link from "next/link";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { TELEGRAM_URL } from "@/lib/config";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Terms & responsible play",
  description: "GebetaSoccer rules, 18+ policy, deposits, withdrawals, scoring, prize split and responsible play.",
  path: "/terms",
});

// NOTE: plain-language starter terms. Have a lawyer review before launch.
const sections: { title: string; body: string[] }[] = [
  {
    title: "1. Who can play",
    body: [
      "You must be 18 years or older to create an account or play. We may ask for proof of age at any time and close accounts that do not meet this rule.",
      "One account per person. Accounts are personal and may not be shared, sold or transferred.",
    ],
  },
  {
    title: "2. Units and payments",
    body: [
      "Your wallet holds Units. 1 Unit = 200 ETB.",
      "Deposits are made manually through our Telegram admin (minimum 1,000 ETB, maximum 100,000 ETB per transaction) and are credited after we confirm the payment.",
      "Withdrawals are requested in the app. The Units are held immediately and the money is sent to your phone number after review.",
    ],
  },
  {
    title: "3. How rounds work",
    body: [
      "Each round has exactly 10 matches. You play by placing a slip with a score for all 10 matches; each slip costs the round's entry fee, paid when it is placed. You may place several slips; each competes on its own.",
      "You can edit a placed slip free of charge until the round locks at its first kickoff. After that no slips can be placed or changed. Placed slips are not refundable. Everyone's slips become visible once the round locks.",
      "Scoring: exact score 3 points; close (correct result and one goal away, or two goals away with the same goal difference, e.g. 1-1 vs 2-2) 1.5 points; correct result 1 point; wrong result 0 points.",
      "Slam Points per round for correct results: 5–7 correct +1, 8–9 correct +2, 10 correct +3.",
      "The prize pool is the total of entry fees. 70% is paid to the winner(s); 30% is the house fee. Winning bar: to win, a slip must score MORE than half of the match points available (more than 15 of 30 for 10 matches; Slam Points do not count; a postponed or cancelled match lowers the bar to half of what is left, e.g. more than 13.5 for 9 matches). If no slip clears the bar, there is no winner for that round and the whole pool is kept by GebetaSoccer. Ties are decided by most correct results, then most exact scores, then most close picks, then the smallest total goal difference; remaining ties share the prize equally.",
      "Postponed or cancelled matches score 0 for everyone.",
    ],
  },
  {
    title: "3b. Private challenges",
    body: [
      "A player can create a challenge on 1 to 10 upcoming matches with a stake per player of 200 to 1,000,000 ETB. The stake is taken from the creator's wallet when the challenge is created and from each player's wallet when they join. A player can only join with enough Units in their wallet.",
      "Scores can be changed free of charge until the first of the selected matches kicks off; after that nobody can join or change scores. Other players' scores are hidden until then.",
      "Scoring is the same as in rounds (3 / 1.5 / 1 / 0, no Slam Points). Postponed or cancelled matches score 0 for everyone. The highest total wins; ties are decided by most correct results, most exact scores, most close picks and smallest total goal difference, and players still level share the prize equally.",
      "The winner(s) receive 90% of all stakes; 10% is the GebetaSoccer fee. If nobody else joins before the first kickoff, or every selected match is called off, all stakes are refunded. The creator may cancel for a full refund while nobody else has joined. Stakes cannot otherwise be refunded.",
    ],
  },
  {
    title: "4. Fair play",
    body: [
      "Using multiple accounts, automated tools or any form of cheating will lead to the account being closed and any balance being withheld.",
      "Our decision on results and scoring is final once a round is settled.",
    ],
  },
  {
    title: "5. Responsible play",
    body: [
      "Only play with money you can afford to lose. Never chase losses.",
      "If you feel you are playing too much, contact us on Telegram and we will pause or close your account.",
    ],
  },
  {
    title: "6. Privacy",
    body: [
      "We store your username, phone number, optional email and your game and wallet history to run the service. We never show your phone or email to other players.",
    ],
  },
];

export default function TermsPage() {
  return (
    <div className="relative">
      <SiteHeader loggedIn={false} />
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Terms &amp; Responsible Play</h1>
        <p className="mt-3 text-sm text-mist">Please read these before you play. Last updated {new Date().getFullYear()}.</p>
        <div className="mt-10 space-y-8">
          {sections.map((s) => (
            <section key={s.title} className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
              <h2 className="text-lg font-extrabold text-lilac-soft">{s.title}</h2>
              <ul className="mt-3 space-y-2 text-sm leading-relaxed text-mist">
                {s.body.map((b) => <li key={b}>{b}</li>)}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm text-mist">
          Questions? <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-lilac">Message us on Telegram</a> ·{" "}
          <Link href="/register" className="font-semibold text-lilac">Create account</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
