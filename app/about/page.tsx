import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { CountUp } from "@/components/CountUp";

export const metadata = { title: "About · GebetaSoccer" };
export const dynamic = "force-dynamic";

const CARDS = [
  { title: "A Game", color: "text-lilac-soft", body: "A weekly football predictor: 10 big matches, one score per match, points for accuracy and a prize pool for the best. Simple to start, hard to master." },
  { title: "A Community", color: "text-[#f0b4c8]", body: "Football is better with friends. GebetaSoccer gives fans across Ethiopia something to argue about, celebrate and come back to every weekend." },
  { title: "Rooted in Gebeta", color: "text-[#9fd8c0]", body: "Our name and logo come from Gebeta — the board of pits and seeds that rewards patience and strategy. We built the same spirit into a football game." },
  { title: "Fair & Transparent", color: "text-[#f5c98a]", body: "70% of every pool goes to the winners. Every deposit, entry and payout is recorded in a ledger that can't be edited, and the rules are public." },
];

export default async function AboutPage() {
  const { loggedIn, stats } = await getPublicContext();
  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title="About GebetaSoccer" />

      <main>
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-3xl font-extrabold">What is GebetaSoccer?</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {CARDS.map((c) => (
              <div key={c.title} className="rounded-[2rem] border border-white/5 bg-card/60 p-8">
                <h3 className={`text-center text-2xl font-extrabold ${c.color}`}>{c.title}</h3>
                <p className="mt-4 leading-relaxed text-mist">{c.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Numbers */}
        <section className="relative overflow-hidden py-16">
          <div className="absolute inset-0 bg-gradient-to-r from-[#3a3166] via-[#4a3f86] to-[#2c2740]" />
          <div className="relative mx-auto max-w-6xl px-6 text-center">
            <h2 className="text-2xl font-extrabold">GebetaSoccer in numbers</h2>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {[
                [Number(stats.players), "Registered players"],
                [Number(stats.predictions), "Predictions made"],
                [Number(stats.rounds), "Rounds completed"],
              ].map(([n, label]) => (
                <div key={String(label)}>
                  <p className="font-mono text-5xl font-bold tracking-tight text-white"><CountUp value={Number(n)} suffix="" /></p>
                  <p className="mt-2 text-sm text-white/80">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Story */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-2xl font-extrabold">Our story</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-mist">
            <p>
              Every weekend, groups of friends across Ethiopia argue about football scores — in cafés, on Telegram and over coffee. GebetaSoccer
              started from a simple idea: turn those arguments into a fair, well-run game with a real leaderboard and a real prize.
            </p>
            <p>
              We borrowed our name from Gebeta, the traditional board game where seeds move from pit to pit and every move counts. Like Gebeta,
              predicting football rewards knowledge, patience and timing.
            </p>
            <p>
              GebetaSoccer is built and run in Ethiopia, for Ethiopian fans. We&apos;re just getting started — more leagues, private leagues for
              friends and more ways to play are on the way.
            </p>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={loggedIn ? "/dashboard" : "/register"} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
              {loggedIn ? "Make predictions" : "Join GebetaSoccer"}
            </Link>
            <Link href="/business" className="inline-flex rounded-full border border-white/60 px-7 py-3.5 text-xs font-bold uppercase tracking-widest hover:bg-white/10">
              Partner with us
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
