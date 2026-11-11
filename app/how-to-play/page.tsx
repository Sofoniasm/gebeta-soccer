import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { ETB_PER_UNIT, MAX_DEPOSIT_UNITS } from "@/lib/money";
import { TELEGRAM_URL } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { SectionTitle } from "@/components/ui";
import { breadcrumbJsonLd, faqJsonLd, pageMeta } from "@/lib/seo";
import { JsonLd } from "@/components/JsonLd";

export const metadata = pageMeta({
  title: "How to Play: Rules, Scoring & FAQ",
  description: "How GebetaSoccer works: predict 10 football scores, exact score 3 points, close 1.5, result 1, Slam Points, tie-breaks, deposits in birr and withdrawals to Telebirr.",
  path: "/how-to-play",
});

const STEPS = [
  { t: "Create your account", d: "Sign up with a username, your phone number and a password. You must be 18 or older." },
  { t: "Top up your wallet", d: `Send money to our Telegram admin (from ${ETB_PER_UNIT} ETB up to ${(MAX_DEPOSIT_UNITS * ETB_PER_UNIT).toLocaleString("en-US")} ETB) and quote your username. 1 Unit = ${ETB_PER_UNIT} ETB.` },
  { t: "Join the weekly round", d: "Each round has 10 big matches and an entry fee shown on the round. Joining takes it from your wallet." },
  { t: "Predict every score", d: "Type a score for each match. You can change a pick any time until that match kicks off — then it locks." },
  { t: "Watch the table move", d: "Points update live as matches finish. Check the leaderboard to see where you stand." },
  { t: "Win and cash out", d: "When the round is settled, 70% of the pool goes to the winner. Withdraw from your wallet to your phone." },
];

const SCORING = [
  ["3", "Exact", "You predicted the exact score."],
  ["1.5", "Close", "Right result and only one goal away — or two goals away with the same goal difference (1-1 vs 2-2)."],
  ["1", "Result", "Right winner or draw, but not close."],
  ["0", "Wrong", "Wrong result."],
];

const FAQ = [
  ["When do predictions lock?", "Each match locks at its own kickoff time. You can still predict later matches in the round."],
  ["What if I forget a match?", "You get a default pick — the most popular score among the other players for that match — so you're never left on zero. Check your To-do list to see which picks you still need."],
  ["Can I see other players' picks?", "Yes. Once a match kicks off, open it from Fixtures or Live & Results to see everyone's picks and how the players split between home win, draw and away win."],
  ["What if a match is postponed?", "A postponed or cancelled match scores 0 for everyone and doesn't count towards Slam Points."],
  ["How are ties decided?", "Most correct results, then most exact scores, then most close picks, then the smallest total goal difference. Players still level share the prize equally."],
  ["How fast are withdrawals?", "Units are held from your wallet straight away, and the admin sends the money to your phone — usually within 24 hours."],
  ["Is my phone number public?", "No. Other players only ever see your username and points."],
];

export default async function HowToPlayPage() {
  const { loggedIn } = await getPublicContext();
  return (
    <div className="relative">
      <JsonLd data={faqJsonLd(FAQ as [string, string][])} />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "" }, { name: "How to play", path: "/how-to-play" }])} />
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title="How to play" subtitle="Six steps from sign-up to cash-out. It takes two minutes to learn and a whole season to master." image="/ball.webp" />

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.t} className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lilac text-sm font-extrabold text-ink">{i + 1}</span>
                <p className="mt-4 text-lg font-extrabold">{s.t}</p>
                <p className="mt-2 text-sm leading-relaxed text-mist">{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pb-16">
          <SectionTitle top="Scoring" bottom="Points per match" />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SCORING.map(([p, t, d]) => (
              <div key={t} className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
                <p className="text-4xl font-extrabold text-lilac">{p}</p>
                <p className="mt-3 font-bold">{t}</p>
                <p className="mt-1 text-sm text-mist">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[2rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-6">
            <p className="text-lg font-extrabold">Slam Points</p>
            <p className="mt-1 text-sm text-mist">
              A bonus for correct results across the round: 5–7 correct <b className="text-white">+1</b>, 8–9 correct <b className="text-white">+2</b>, all 10 correct <b className="text-white">+3</b>.
            </p>
          </div>
        </section>

        <section className="pb-16">
          <SectionTitle top="Questions" bottom="Quick answers" />
          <div className="mt-8 space-y-3">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group rounded-[1.5rem] border border-white/5 bg-card/60 p-5">
                <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
                  {q} <span className="text-lilac transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-mist">{a}</p>
              </details>
            ))}
          </div>
          <p className="mt-8 text-sm text-mist">
            Still stuck? <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-lilac">Message us on Telegram</a> or read the{" "}
            <Link href="/terms" className="font-semibold text-lilac">full rules</Link>.
          </p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
