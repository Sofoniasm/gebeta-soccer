import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRound, getRoundPool } from "@/lib/rounds";
import { unitsToEtb, ETB_PER_UNIT, DEFAULT_HOUSE_CUT } from "@/lib/money";
import { POINTS } from "@/lib/scoring";
import { Logo, LogoMark, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { CountUp } from "@/components/CountUp";
import { BallIcon, ShieldIcon, TrophyIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

const glass = "rounded-3xl border border-white/10 bg-white/[0.04] backdrop-blur-xl";

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
  const examplePlayers = 100;
  const examplePool = examplePlayers * ETB_PER_UNIT;

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      {/* Background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-forest/50 blur-3xl" />
      <div className="pointer-events-none absolute top-[30rem] -right-32 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

      {/* Nav */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-pitch/70 backdrop-blur-xl">
        <nav className="mx-auto flex max-w-5xl items-center justify-between px-5 py-3">
          <Logo size="sm" />
          {loggedIn ? (
            <Link href="/dashboard" className={secondaryButtonClass}>My predictions</Link>
          ) : (
            <Link href="/login" className={secondaryButtonClass}>Log in</Link>
          )}
        </nav>
      </header>

      <main className="relative mx-auto max-w-5xl px-5 pb-16">
        {/* Hero */}
        <section className="grid items-center gap-10 pt-10 md:grid-cols-2 md:pt-16">
          <div className="text-center md:text-left">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-amber-300">
              <BallIcon size={14} /> Ethiopia&apos;s football prediction game
            </p>
            <h1 className="text-[2.6rem] font-black leading-[1.05] tracking-tight sm:text-6xl">
              Predict. Win.
              <br />
              <span className="bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 bg-clip-text text-transparent">
                Dominate the Gebeta.
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-md text-base text-neutral-300 md:mx-0">
              Call the scores of 10 big matches every week. Top the table and take {prizePct}% of the prize pool.
            </p>
            <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 md:mx-0">
              <Link href={loggedIn ? "/dashboard" : "/register"} className={`${primaryButtonClass} py-4 text-lg`}>
                {loggedIn ? "Make your predictions" : "Create free account"}
              </Link>
              {!loggedIn && (
                <Link href="/login" className={`${secondaryButtonClass} w-full py-3.5`}>
                  I already have an account
                </Link>
              )}
            </div>
          </div>

          {/* Prize pool */}
          <div className={`${glass} relative overflow-hidden p-6 text-center shadow-2xl shadow-black/40`}>
            <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
            <div className="relative">
              <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-300">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-400" />
                </span>
                {activeRound ? `${activeRound.name} · live prize pool` : "Prize pool"}
              </p>
              <p className="mt-3 bg-gradient-to-b from-white to-amber-200 bg-clip-text text-5xl font-black text-transparent sm:text-6xl">
                <CountUp value={prizeEtb} />
              </p>
              <p className="mt-2 text-sm text-neutral-400">
                {pool && pool.entrants > 0
                  ? `${pool.entrants} player${pool.entrants === 1 ? "" : "s"} in · grows with every entry`
                  : activeRound
                    ? "Be the first to join this round"
                    : "Next round opens soon"}
              </p>
              <LogoMark className="mx-auto mt-6 h-20 w-20" />
              <p className="mt-3 text-xs text-neutral-500">Entry: 1 unit = {ETB_PER_UNIT} ETB</p>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mt-20">
          <h2 className="text-center text-2xl font-black tracking-tight md:text-left">How it works</h2>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {[
              { icon: <BallIcon size={22} />, title: "Predict 10 matches", text: "Join the weekly round and call the exact score of every match before kickoff." },
              { icon: <TrophyIcon size={22} />, title: "Beat the leaderboard", text: "Earn points for exact scores and correct results. Most points wins." },
              { icon: <span className="text-lg font-black">{prizePct}%</span>, title: `Take ${prizePct}% of the pool`, text: "The winner takes the prize pool. Ties share it, split by most exact scores." },
            ].map((s, i) => (
              <div key={s.title} className={`${glass} p-5`}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-300 to-amber-500 text-emerald-950">
                    {s.icon}
                  </div>
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-500">Step {i + 1}</span>
                </div>
                <p className="mt-4 text-lg font-bold">{s.title}</p>
                <p className="mt-1 text-sm text-neutral-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Transparency */}
        <section className="mt-16">
          <div className={`${glass} p-6`}>
            <div className="flex items-center gap-2 text-amber-300">
              <ShieldIcon size={18} />
              <h2 className="text-lg font-black text-white">Where every birr goes</h2>
            </div>
            <p className="mt-2 text-sm text-neutral-400">
              No hidden fees. {prizePct}% of all entries goes to the winners, {housePct}% runs GebetaSoccer.
            </p>

            <div className="mt-5 flex h-4 overflow-hidden rounded-full bg-white/10">
              <div className="bg-gradient-to-r from-amber-300 to-amber-500" style={{ width: `${prizePct}%` }} />
              <div className="bg-forest" style={{ width: `${housePct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs font-semibold">
              <span className="text-amber-300">{prizePct}% prize pool</span>
              <span className="text-emerald-400">{housePct}% house fee</span>
            </div>

            <div className="mt-5 rounded-2xl bg-black/30 p-4 text-sm text-neutral-300">
              Example: {examplePlayers} players × {ETB_PER_UNIT} ETB = {examplePool.toLocaleString("en-US")} ETB pool →{" "}
              <b className="text-amber-300">{Math.round(examplePool * (prizePct / 100)).toLocaleString("en-US")} ETB</b> to the winner.
            </div>
          </div>
        </section>

        {/* Scoring */}
        <section className="mt-16">
          <h2 className="text-2xl font-black tracking-tight">Scoring</h2>
          <div className={`${glass} mt-5 overflow-hidden`}>
            {[
              ["Exact score", POINTS.EXACT, "You say 2-1, it ends 2-1"],
              ["Right result, close", POINTS.CLOSE, "Same goal difference, or 1 goal off"],
              ["Right result", POINTS.RESULT, "Correct winner or draw"],
              ["Wrong result", POINTS.WRONG, "Better luck next match"],
            ].map(([label, pts, ex]) => (
              <div key={String(label)} className="flex items-center justify-between border-b border-white/5 px-5 py-4 last:border-0">
                <div>
                  <p className="font-semibold">{label}</p>
                  <p className="text-xs text-neutral-500">{ex}</p>
                </div>
                <span className="text-2xl font-black text-amber-300">{pts}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Final CTA */}
        {!loggedIn && (
          <section className="mt-16 text-center">
            <h2 className="text-3xl font-black tracking-tight">Ready to play?</h2>
            <p className="mt-2 text-neutral-400">Sign up with just your phone number.</p>
            <Link href="/register" className={`${primaryButtonClass} mx-auto mt-6 max-w-sm py-4 text-lg`}>
              Create free account
            </Link>
          </section>
        )}
      </main>

      <footer className="border-t border-white/5 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5 text-center">
          <Logo size="sm" />
          <p className="text-xs text-neutral-500">18+ only. Play responsibly — only stake what you can afford to lose.</p>
        </div>
      </footer>
    </div>
  );
}
