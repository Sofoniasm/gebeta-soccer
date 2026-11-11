import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRound, getRoundPool } from "@/lib/rounds";
import { unitsToEtb, ETB_PER_UNIT } from "@/lib/money";
import { formatEtb } from "@/lib/format";
import { POINTS } from "@/lib/scoring";
import { Logo, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { BallIcon, TrophyIcon, WalletIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const [{ data: auth }, round] = await Promise.all([supabase.auth.getUser(), getCurrentRound(supabase)]);
  const pool = round && round.status !== "settled" ? await getRoundPool(supabase, round.id) : null;
  const loggedIn = !!auth.user;

  return (
    <main className="relative mx-auto min-h-dvh max-w-lg overflow-hidden px-5 pb-16">
      {/* glow */}
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-emerald-500/20 blur-3xl" />

      <header className="relative flex items-center justify-between py-5">
        <Logo />
        {loggedIn ? (
          <Link href="/dashboard" className={secondaryButtonClass}>Dashboard</Link>
        ) : (
          <Link href="/login" className={secondaryButtonClass}>Log in</Link>
        )}
      </header>

      {/* Hero */}
      <section className="relative pt-8 text-center">
        <p className="mx-auto mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">
          <BallIcon size={14} /> Weekly football predictions
        </p>
        <h1 className="text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          Predict the scores.
          <br />
          <span className="bg-gradient-to-r from-emerald-400 to-lime-300 bg-clip-text text-transparent">Win the pot.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-neutral-400">
          10 matches every week. Call the scores, beat other players, and top the GebetaSoccer table.
        </p>

        {/* Prize pool */}
        <div className="mx-auto mt-8 max-w-sm rounded-3xl border border-lime-300/20 bg-gradient-to-br from-lime-300/10 via-emerald-500/10 to-transparent p-6">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-lime-300">
            <TrophyIcon size={16} /> {round && pool ? `${round.name} prize pot` : "This week's prize pot"}
          </p>
          <p className="mt-2 text-4xl font-black">{formatEtb(pool ? unitsToEtb(pool.prize_fund_units) : 0)}</p>
          <p className="mt-1 text-sm text-neutral-400">
            {pool ? `${pool.entrants} player${pool.entrants === 1 ? "" : "s"} in` : "Next round opening soon"}
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-sm space-y-3">
          <Link href={loggedIn ? "/dashboard" : "/register"} className={primaryButtonClass}>
            {loggedIn ? "Make your predictions" : "Register & play"}
          </Link>
          {!loggedIn && (
            <Link href="/login" className={`${secondaryButtonClass} w-full py-3.5`}>
              I already have an account
            </Link>
          )}
        </div>
      </section>

      {/* How it works */}
      <section className="relative mt-14 space-y-3">
        <h2 className="text-lg font-bold">How it works</h2>
        {[
          { icon: <WalletIcon />, title: "Top up", text: `Deposit via Telebirr. 1 unit = ${ETB_PER_UNIT} ETB.` },
          { icon: <BallIcon />, title: "Predict", text: "Join the round and predict the score of every match before kickoff." },
          { icon: <TrophyIcon />, title: "Win", text: "Most points wins the pot. Ties are split by most exact scores." },
        ].map((s, i) => (
          <div key={s.title} className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300">{s.icon}</div>
            <div>
              <p className="font-semibold">{i + 1}. {s.title}</p>
              <p className="text-sm text-neutral-400">{s.text}</p>
            </div>
          </div>
        ))}
      </section>

      {/* Scoring */}
      <section className="relative mt-10">
        <h2 className="mb-3 text-lg font-bold">Scoring</h2>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {[
            ["Exact score", POINTS.EXACT, "You say 2-1, it ends 2-1"],
            ["Right result, close", POINTS.CLOSE, "Same goal difference or 1 goal off"],
            ["Right result", POINTS.RESULT, "Correct winner or draw"],
            ["Wrong result", POINTS.WRONG, ""],
          ].map(([label, pts, ex]) => (
            <div key={String(label)} className="flex items-center justify-between border-b border-white/5 px-4 py-3 last:border-0">
              <div>
                <p className="text-sm font-semibold">{label}</p>
                {ex && <p className="text-xs text-neutral-500">{ex}</p>}
              </div>
              <span className="text-lg font-black text-emerald-300">{pts}</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative mt-12 text-center text-xs text-neutral-600">© GebetaSoccer · 18+ only · Play responsibly</footer>
    </main>
  );
}
