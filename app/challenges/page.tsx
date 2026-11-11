import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { formatKickoff } from "@/lib/format";
import { etbLabel } from "@/lib/money";
import { CHALLENGE_FEE, challengePrizeUnits, type MyChallenge } from "@/lib/challenges";
import { openChallengeByCode } from "./open";

export const metadata = { title: "Challenges · GebetaSoccer" };
export const dynamic = "force-dynamic";

function statusOf(c: MyChallenge): { label: string; cls: string } {
  if (c.status === "settled") return c.my_payout && c.my_payout > 0 ? { label: "Won", cls: "bg-emerald-400/15 text-emerald-200" } : { label: "Finished", cls: "bg-white/10 text-mist" };
  if (c.status === "refunded") return { label: "Refunded", cls: "bg-white/10 text-mist" };
  if (c.status === "cancelled") return { label: "Cancelled", cls: "bg-white/10 text-mist" };
  if (new Date(c.lock_at).getTime() <= Date.now()) return { label: "Live", cls: "bg-rose-400/15 text-rose-200" };
  return { label: "Open", cls: "bg-lilac/20 text-lilac-soft" };
}

export default async function ChallengesPage({ searchParams }: { searchParams: Promise<{ err?: string }> }) {
  await getMe("/challenges");
  const { err } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_my_challenges");
  const list = ((data ?? []) as MyChallenge[]).map((c) => ({ ...c, stake_units: Number(c.stake_units), players: Number(c.players), matches: Number(c.matches), my_payout: c.my_payout === null ? null : Number(c.my_payout) }));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

  return (
    <AppShell title="Challenges" next="/challenges">
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-6">
        <div className="animate-glow pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-lilac/30 blur-3xl" />
        <h2 className="relative text-xl font-extrabold sm:text-2xl">Challenge your friends</h2>
        <p className="relative mt-2 max-w-xl text-sm text-mist">
          Pick 1 to 10 matches, set your stake and send the link. Everyone who joins pays the same and predicts the same matches.
          Highest score takes {Math.round((1 - CHALLENGE_FEE) * 100)}% of the pot.
        </p>
        <Link href="/challenges/new" className="relative mt-5 inline-flex rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
          + Create a challenge
        </Link>
      </section>

      <section className={`${card} mb-5`}>
        <form action={openChallengeByCode} className="flex gap-2">
          <input name="code" required placeholder="Got a code? GC-XXXXXX" className="w-full rounded-2xl border border-white/10 bg-ink/70 px-4 py-3 text-base uppercase text-white placeholder:normal-case placeholder:text-mist/60 outline-none focus:border-lilac" />
          <button className="shrink-0 rounded-full border border-white/60 px-5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">Open</button>
        </form>
        {err && <p className="mt-2 text-sm text-rose-200">{err}</p>}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">My challenges</h2>
        {list.length === 0 ? (
          <p className="text-sm text-mist">No challenges yet. Create one and send the link to a friend.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {list.map((c) => {
              const st = statusOf(c);
              return (
                <li key={c.code}>
                  <Link href={`/challenges/${c.code}`} className="flex items-center gap-3 py-3 hover:opacity-90">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.cls}`}>{st.label}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{c.code}</span>
                      </div>
                      <p className="mt-1 truncate text-sm font-bold">{c.title}</p>
                      <p className="text-xs text-mist">
                        {c.matches} match{c.matches === 1 ? "" : "es"} · {c.players}{c.max_players ? `/${c.max_players}` : ""} players · stake {etbLabel(c.stake_units)}
                        {c.status === "open" && ` · closes ${formatKickoff(c.lock_at)}`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {c.status === "settled" && c.my_payout && c.my_payout > 0 ? (
                        <p className="text-sm font-extrabold text-emerald-200">+{etbLabel(c.my_payout)}</p>
                      ) : (
                        <p className="text-sm font-extrabold">{etbLabel(challengePrizeUnits(c.stake_units, c.players))}</p>
                      )}
                      <p className="text-[10px] uppercase tracking-wider text-mist">{c.status === "settled" ? (c.my_rank ? `Rank ${c.my_rank}` : "") : "prize"}</p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
