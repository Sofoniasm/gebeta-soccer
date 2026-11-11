import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRound, getRoundPool } from "@/lib/rounds";
import { unitsToEtb, ETB_PER_UNIT, DEFAULT_HOUSE_CUT } from "@/lib/money";
import { POINTS } from "@/lib/scoring";
import { LogoMark, SectionTitle } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import { FlowLines } from "@/components/FlowLines";
import { PhoneMockup } from "@/components/PhoneMockup";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ArrowRightIcon, BallIcon, SendIcon, ShieldIcon, StarIcon, TrophyIcon, WalletIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const pill =
  "inline-flex items-center justify-center rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink shadow-lg shadow-lilac/20 transition hover:bg-lilac-soft";

export default async function Home() {
  const supabase = await createClient();
  const [{ data: auth }, round] = await Promise.all([supabase.auth.getUser(), getCurrentRound(supabase)]);
  const activeRound = round && round.status !== "settled" ? round : null;
  const pool = activeRound ? await getRoundPool(supabase, activeRound.id) : null;
  const loggedIn = !!auth.user;

  const houseCut = activeRound ? Number(activeRound.house_cut) : DEFAULT_HOUSE_CUT;
  const prizePct = Math.round((1 - houseCut) * 100);
  const housePct = 100 - prizePct;
  const prizeEtb = pool ? unitsToEtb(pool.prize_fund_units) : 0;
  const examplePool = 100 * ETB_PER_UNIT;
  const ctaHref = loggedIn ? "/dashboard" : "/register";

  return (
    <div className="relative overflow-x-hidden">
      <FlowLines />
      <SiteHeader loggedIn={loggedIn} />

      <main className="relative mx-auto max-w-6xl px-6">
        {/* ------------------------------------------------ Hero */}
        <section className="grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-20">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-[3.4rem]">
              <span className="text-lilac">Predict</span> The Scores.
              <br />
              Win <span className="text-lilac">The Gebeta.</span>
            </h1>
            <p className="mx-auto mt-6 max-w-md text-base leading-relaxed text-mist lg:mx-0">
              Call the scores of 10 big matches every week. Climb the table, beat your friends and take {prizePct}% of the prize pool.
            </p>
            <div className="mt-9 flex items-center justify-center gap-5 lg:justify-start">
              <Link href={ctaHref} className={pill}>
                {loggedIn ? "Make predictions" : "Create free account"}
              </Link>
              <Link href="#how" className="text-lilac transition hover:translate-x-1" aria-label="How it works">
                <ArrowRightIcon size={30} />
              </Link>
            </div>
          </div>

          {/* Squircle with app preview */}
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-0 rotate-3 rounded-[3.5rem] bg-gradient-to-br from-lilac/70 via-[#8a7bd8]/60 to-[#5b4f96]/60" />
            <div className="relative flex justify-center rounded-[3.5rem] border border-white/10 bg-gradient-to-br from-[#9d8fe6] to-[#5f539c] px-6 py-10">
              <PhoneMockup />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Info strip */}
        <section className="rounded-[2.5rem] border border-white/5 bg-gradient-to-r from-card/80 via-[#3e3660]/80 to-card/80 px-6 py-6 backdrop-blur">
          <div className="grid gap-6 sm:grid-cols-3 sm:divide-x sm:divide-white/10">
            {[
              { icon: <WalletIcon size={26} />, title: "Top up with Telebirr", text: `1 unit = ${ETB_PER_UNIT} ETB` },
              { icon: <SendIcon size={26} />, title: "Confirmed on Telegram", text: "Send your receipt, we credit fast" },
              { icon: <ShieldIcon size={26} />, title: "Fair & transparent", text: `${prizePct}% to winners, every round` },
            ].map((i) => (
              <div key={i.title} className="flex items-center gap-4 sm:justify-center sm:px-4">
                <span className="text-lilac-soft">{i.icon}</span>
                <div>
                  <p className="font-bold">{i.title}</p>
                  <p className="text-xs text-mist">{i.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ Introduction */}
        <section id="how" className="grid scroll-mt-24 gap-8 py-20 lg:grid-cols-2 lg:items-center">
          <SectionTitle top="Introduction" bottom="To GebetaSoccer" />
          <p className="text-sm leading-relaxed text-mist">
            Every week we pick 10 big matches. You predict the exact score of each one before kickoff. Exact scores and correct
            results earn points, and the player with the most points wins the prize pool. Like Gebeta, the board game of seeds and
            strategy we all grew up with, it rewards patience, knowledge and a little bit of nerve.
          </p>
        </section>

        {/* ------------------------------------------------ Prize pool */}
        <section id="prize" className="grid scroll-mt-24 items-center gap-12 lg:grid-cols-2">
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-0 -rotate-3 rounded-[3.5rem] bg-gradient-to-br from-[#5f539c]/70 to-lilac/50" />
            <div className="relative rounded-[3.5rem] border border-white/10 bg-gradient-to-br from-card to-ink px-8 py-12 text-center">
              <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-lilac">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lilac opacity-70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-lilac" />
                </span>
                {activeRound ? `${activeRound.name} · live pool` : "Prize pool"}
              </p>
              <p className="mt-4 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
                <CountUp value={prizeEtb} />
              </p>
              <p className="mt-3 text-sm text-mist">
                {pool && pool.entrants > 0
                  ? `${pool.entrants} player${pool.entrants === 1 ? "" : "s"} in · grows with every entry`
                  : activeRound
                    ? "Be the first to join this round"
                    : "Next round opens soon"}
              </p>
              <LogoMark className="mx-auto mt-8 h-20 w-20" tile />
            </div>
          </div>

          <div>
            <SectionTitle top="About" bottom="The prize pool" />
            <p className="mt-6 text-sm leading-relaxed text-mist">
              No hidden fees. {prizePct}% of every entry goes straight to the winners and {housePct}% runs GebetaSoccer. The pot grows
              with every player who joins, and you can see it live right here.
            </p>
            <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-white/10">
              <div className="bg-lilac" style={{ width: `${prizePct}%` }} />
              <div className="bg-[#5f539c]" style={{ width: `${housePct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs font-semibold">
              <span className="text-lilac-soft">{prizePct}% prize pool</span>
              <span className="text-mist">{housePct}% house fee</span>
            </div>
            <p className="mt-6 rounded-2xl bg-ink/60 p-4 text-sm text-mist">
              Example: 100 players × {ETB_PER_UNIT} ETB = {examplePool.toLocaleString("en-US")} ETB →{" "}
              <b className="text-white">{Math.round(examplePool * (prizePct / 100)).toLocaleString("en-US")} ETB</b> to the winner.
            </p>
            <Link href={ctaHref} className={`${pill} mt-8`}>
              {loggedIn ? "Join this round" : "Get in the game"}
            </Link>
          </div>
        </section>

        {/* ------------------------------------------------ Why play */}
        <section className="py-20">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <SectionTitle top="Why play" bottom="With GebetaSoccer" />
            <p className="text-sm leading-relaxed text-mist">
              Built in Ethiopia for Ethiopian football fans. Simple on any phone, quick to top up, and completely transparent about where
              every birr goes.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: <BallIcon size={30} />, title: "Predict", text: "10 big matches every week. Lock your scores before kickoff." },
              { icon: <TrophyIcon size={30} />, title: "Compete", text: "Earn points for exact scores and correct results." },
              { icon: <StarIcon size={30} />, title: "Win", text: `Top the table and take ${prizePct}% of the pool.` },
              { icon: <ShieldIcon size={30} />, title: "Trust", text: "Every deposit and payout is recorded and can't be edited." },
            ].map((c) => (
              <div key={c.title} className="rounded-[2rem] border border-white/5 bg-card/60 p-6 text-center">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-plum bg-gradient-to-br from-lilac to-[#6c5fb3] text-ink shadow-lg shadow-black/30">
                  {c.icon}
                </div>
                <p className="mt-5 text-sm font-extrabold uppercase tracking-widest">{c.title}</p>
                <p className="mt-2 text-sm text-mist">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ Scoring */}
        <section id="scoring" className="scroll-mt-24 pb-20">
          <SectionTitle top="Scoring" bottom="How points work" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [POINTS.EXACT, "Exact score", "You say 2-1, it ends 2-1"],
              [POINTS.CLOSE, "Right result, close", "Same goal difference, or 1 goal off"],
              [POINTS.RESULT, "Right result", "Correct winner or draw"],
              [POINTS.WRONG, "Wrong result", "Better luck next match"],
            ].map(([pts, label, ex]) => (
              <div key={String(label)} className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
                <p className="text-4xl font-extrabold text-lilac">{pts}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-mist">points</p>
                <p className="mt-4 font-bold">{label}</p>
                <p className="mt-1 text-sm text-mist">{ex}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ CTA */}
        {!loggedIn && (
          <section className="mb-20 overflow-hidden rounded-[3rem] bg-gradient-to-br from-[#9d8fe6] to-[#5f539c] px-6 py-14 text-center">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ready to play?</h2>
            <p className="mt-3 text-white/80">Sign up with just your phone number. It takes 30 seconds.</p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-ink px-8 py-4 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-black"
            >
              Create free account
            </Link>
          </section>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}
