import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRound, getRoundPool } from "@/lib/rounds";
import { unitsToEtb, ETB_PER_UNIT, DEFAULT_HOUSE_CUT } from "@/lib/money";
import { POINTS } from "@/lib/scoring";
import { LogoMark, SectionTitle } from "@/components/ui";
import { formatKickoff } from "@/lib/format";
import { CountUp } from "@/components/CountUp";
import { FlowLines } from "@/components/FlowLines";
import { PhoneMockup } from "@/components/PhoneMockup";
import { HeroScene } from "@/components/HeroScene";
import { MatchTicker, type TickerMatch } from "@/components/MatchTicker";
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
  const { data: upcoming } = await supabase
    .from("matches")
    .select("home_team, away_team, kickoff_at, competition")
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at", { ascending: true })
    .limit(12);
  const tickerMatches = (upcoming ?? []) as TickerMatch[];

  // Public numbers (needs migration 0008; falls back gracefully)
  const { data: statsRow } = await supabase.rpc("get_public_stats").maybeSingle();
  const stats = (statsRow ?? { players: 0, predictions: 0, rounds: 0 }) as { players: number; predictions: number; rounds: number };

  // Featured matches: this round's fixtures, else the next upcoming ones
  let featured: { home_team: string; away_team: string; kickoff_at: string; competition: string | null; home_crest?: string | null; away_crest?: string | null }[] = [];
  if (activeRound) {
    const { data } = await supabase
      .from("matches")
      .select("home_team, away_team, kickoff_at, competition, home_crest, away_crest")
      .eq("round_id", activeRound.id)
      .gt("kickoff_at", new Date().toISOString())
      .order("kickoff_at")
      .limit(3);
    featured = data ?? [];
  }
  if (featured.length === 0) {
    const { data } = await supabase
      .from("matches")
      .select("home_team, away_team, kickoff_at, competition, home_crest, away_crest")
      .eq("status", "scheduled")
      .gt("kickoff_at", new Date().toISOString())
      .order("kickoff_at")
      .limit(3);
    featured = data ?? [];
  }

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

      {/* ------------------------------------------------ Hero: stadium photo, centred brand */}
      <section className="relative isolate overflow-hidden">
        <HeroScene />
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-16 pt-14 text-center sm:pt-20 lg:pb-24">
          <LogoMark tile className="h-24 w-24 drop-shadow-[0_10px_40px_rgba(169,156,240,0.55)] sm:h-32 sm:w-32" />
          <p className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-6xl">
            Gebeta<span className="text-lilac">Soccer</span>
          </p>
          <h1 className="mt-6 text-lg font-bold uppercase tracking-[0.25em] text-white/90 sm:text-2xl">
            Football Predictor Game
          </h1>
          <p className="mt-5 flex flex-wrap items-baseline justify-center gap-x-3 text-white/80">
            {stats.players > 0 ? (
              <>
                played by <span className="text-4xl font-extrabold tabular-nums text-white sm:text-5xl"><CountUp value={Number(stats.players)} suffix="" /></span> football fans
              </>
            ) : (
              <span className="text-lg">Predict the scores. Win the Gebeta.</span>
            )}
          </p>
          <p className="mt-2 text-sm text-white/60">10 big matches every week · {prizePct}% of every pool goes to the winners</p>

          <div className="mt-9 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={ctaHref} className={`${pill} w-full sm:w-auto`}>
              {loggedIn ? "Make predictions" : "Create free account"}
            </Link>
            {!loggedIn && (
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/70 bg-black/20 px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur hover:bg-white/10 sm:w-auto"
              >
                Log in
              </Link>
            )}
          </div>

          {/* Prize pot */}
          <div className="mt-10 inline-flex items-center gap-4 rounded-full border border-white/10 bg-black/30 px-6 py-3 backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lilac opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lilac" />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-lilac-soft">{activeRound ? `${activeRound.name} prize pot` : "Prize pot"}</span>
            <span className="text-xl font-extrabold text-white"><CountUp value={prizeEtb} /></span>
          </div>
        </div>

        {/* Popular this week */}
        {featured.length > 0 && (
          <div className="mx-auto max-w-6xl px-6 pb-16">
            <p className="mb-5 text-center text-xl font-bold text-white sm:text-2xl">Big matches this week</p>
            <div className="grid gap-4 md:grid-cols-3">
              {featured.map((m, i) => (
                <Link
                  key={i}
                  href={ctaHref}
                  className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#141022]/75 backdrop-blur-xl transition hover:-translate-y-1 hover:border-lilac/40"
                >
                  <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.04] px-5 py-3 text-xs">
                    <span className="font-bold uppercase tracking-widest text-lilac">{m.competition ?? "Football"}</span>
                    <span className="text-mist">{formatKickoff(m.kickoff_at)}</span>
                  </div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 py-6">
                    <div className="flex flex-col items-center gap-2 text-center">
                      {m.home_crest ? <img src={m.home_crest} alt="" className="h-12 w-12 object-contain" loading="lazy" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 font-bold">{m.home_team.slice(0, 2)}</span>}
                      <span className="text-sm font-bold">{m.home_team}</span>
                    </div>
                    <span className="text-xs font-extrabold text-mist">VS</span>
                    <div className="flex flex-col items-center gap-2 text-center">
                      {m.away_crest ? <img src={m.away_crest} alt="" className="h-12 w-12 object-contain" loading="lazy" /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10 font-bold">{m.away_team.slice(0, 2)}</span>}
                      <span className="text-sm font-bold">{m.away_team}</span>
                    </div>
                  </div>
                  <div className="border-t border-white/5 px-5 py-3 text-center text-xs font-bold uppercase tracking-widest text-lilac transition group-hover:bg-lilac group-hover:text-ink">
                    Predict the score →
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      <MatchTicker matches={tickerMatches} />

      <main className="relative mx-auto max-w-7xl px-6 lg:px-10">
        {/* ------------------------------------------------ Info strip */}
        <section className="mt-12 rounded-[2.5rem] border border-white/5 bg-gradient-to-r from-card/80 via-[#3e3660]/80 to-card/80 px-6 py-6 backdrop-blur">
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
        <section id="how" className="grid scroll-mt-24 items-center gap-12 py-20 lg:grid-cols-2">
          <div>
            <SectionTitle top="Introduction" bottom="To GebetaSoccer" />
            <p className="mt-6 text-sm leading-relaxed text-mist">
            Every week we pick 10 big matches. You predict the exact score of each one before kickoff. Exact scores and correct
            results earn points, and the player with the most points wins the prize pool. Like Gebeta, the board game of seeds and
            strategy we all grew up with, it rewards patience, knowledge and a little bit of nerve.
          </p>
          </div>
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-0 rotate-3 rounded-[3.5rem] bg-gradient-to-br from-lilac/70 via-[#8a7bd8]/60 to-[#5b4f96]/60" />
            <div className="relative flex justify-center rounded-[3.5rem] border border-white/10 bg-gradient-to-br from-[#9d8fe6] to-[#5f539c] px-6 py-10">
              <PhoneMockup className="animate-float" />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------ Prize pool */}
        <section id="prize" className="grid scroll-mt-24 items-center gap-12 lg:grid-cols-2">
          <div className="relative mx-auto w-full max-w-md">
            <div className="absolute inset-0 -rotate-3 rounded-[3.5rem] bg-gradient-to-br from-[#5f539c]/70 to-lilac/50" />
            <div className="relative overflow-hidden rounded-[3.5rem] border border-white/10 bg-ink px-8 py-12 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/ball.webp" alt="" loading="lazy" className="animate-pitch-zoom absolute inset-0 h-full w-full object-cover object-[50%_70%]" />
              <div className="absolute inset-0 bg-gradient-to-b from-[#0b0912]/85 via-[#0b0912]/55 to-[#0b0912]/20" />
              <div className="relative">
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
              <div className="h-40" />
              </div>
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

      </main>

      {/* ------------------------------------------------ Why play (full-width dark band) */}
      <section className="relative mt-20 overflow-hidden bg-[#16121f] py-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/crowd.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-bottom opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-plum via-[#0b0912]/70 to-[#0b0912]/90" />
        <div className="animate-glow pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-lilac/15 blur-3xl" />
        <div className="animate-glow pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#6c5fb3]/20 blur-3xl [animation-delay:2.5s]" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
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
              <div key={c.title} className="rounded-[2rem] border border-white/5 bg-card/60 p-6 text-center transition duration-300 hover:-translate-y-2 hover:border-lilac/30 hover:bg-card">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-plum bg-gradient-to-br from-lilac to-[#6c5fb3] text-ink shadow-lg shadow-black/30">
                  {c.icon}
                </div>
                <p className="mt-5 text-sm font-extrabold uppercase tracking-widest">{c.title}</p>
                <p className="mt-2 text-sm text-mist">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        {/* ------------------------------------------------ Scoring */}
        <section id="scoring" className="scroll-mt-24 py-20">
          <SectionTitle top="Scoring" bottom="How points work" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              [POINTS.EXACT, "Exact score", "You say 2-1, it ends 2-1"],
              [POINTS.CLOSE, "Right result, close", "Same goal difference, or 1 goal off"],
              [POINTS.RESULT, "Right result", "Correct winner or draw"],
              [POINTS.WRONG, "Wrong result", "Better luck next match"],
            ].map(([pts, label, ex]) => (
              <div key={String(label)} className="rounded-[2rem] border border-white/5 bg-card/60 p-6 transition duration-300 hover:-translate-y-2 hover:border-lilac/30">
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
          <section className="relative mb-20 overflow-hidden rounded-[3rem] px-6 py-20 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/stadium.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <div className="animate-shimmer absolute inset-0 bg-[linear-gradient(110deg,rgba(95,83,156,0.85),rgba(157,143,230,0.6),rgba(95,83,156,0.85),rgba(157,143,230,0.6))] bg-[length:200%_100%]" />
            <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Ready to play?</h2>
            <p className="mt-3 text-white/80">Sign up with just your phone number. It takes 30 seconds.</p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-ink px-8 py-4 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-black"
            >
              Create free account
            </Link>
            </div>
          </section>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
