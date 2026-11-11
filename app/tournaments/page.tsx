import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { formatKickoff } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { Crest, dayKeyOf, dayOf, timeOf } from "@/components/MatchLine";
import { pageMeta } from "@/lib/seo";
import { ALL_COMPETITIONS, getSiteSettings } from "@/lib/site-settings";
import { getActiveRounds, getRoundPool } from "@/lib/rounds";
import { predictionPath } from "@/lib/predictions";
import { etbLabel } from "@/lib/money";

export const metadata = pageMeta({
  title: "Football tournaments",
  description:
    "The leagues you can predict on GebetaSoccer: Premier League and top European football. Daily rounds of 10 matches, private challenges, prizes in birr.",
  path: "/tournaments",
});
export const dynamic = "force-dynamic";

type Fixture = {
  id: number;
  competition: string | null;
  home_team: string;
  away_team: string;
  home_crest: string | null;
  away_crest: string | null;
  kickoff_at: string;
};

export default async function TournamentsPage() {
  const { supabase, loggedIn } = await getPublicContext();
  const site = await getSiteSettings();

  const [{ data }, rounds] = await Promise.all([
    supabase
      .from("matches")
      .select("id, competition, home_team, away_team, home_crest, away_crest, kickoff_at")
      .eq("status", "scheduled")
      .gt("kickoff_at", new Date().toISOString())
      .lt("kickoff_at", new Date(Date.now() + 10 * 86400 * 1000).toISOString())
      .order("kickoff_at")
      .limit(400),
    getActiveRounds(supabase),
  ]);
  const upcoming = (data ?? []) as Fixture[];
  const byComp = new Map<string, Fixture[]>();
  for (const m of upcoming) byComp.set(m.competition ?? "", [...(byComp.get(m.competition ?? "") ?? []), m]);

  const followed = ALL_COMPETITIONS.filter((c) => site.competitions.includes(c.code));
  const notYet = ALL_COMPETITIONS.filter((c) => !site.competitions.includes(c.code));
  const openRounds = rounds.filter((r) => r.bettable);
  const pools = await Promise.all(openRounds.map((r) => getRoundPool(supabase, r.id)));

  const days = new Map<string, Fixture[]>();
  for (const m of upcoming.slice(0, 40)) days.set(dayKeyOf(m.kickoff_at), [...(days.get(dayKeyOf(m.kickoff_at)) ?? []), m]);

  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title="Tournaments" subtitle="Daily rounds of 10 big matches, picked from the best football leagues in the world." />

      {/* Open rounds right now */}
      {openRounds.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
          <h2 className="mb-3 text-xl font-extrabold">Open now</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {openRounds.map((r, i) => (
              <Link
                key={r.id}
                href={loggedIn ? `/dashboard?round=${r.id}` : "/register"}
                className="flex items-center justify-between gap-3 rounded-[1.5rem] border border-lilac/30 bg-gradient-to-r from-lilac/15 to-transparent p-5 hover:border-lilac/60"
              >
                <div className="min-w-0">
                  <p className="truncate text-lg font-extrabold">{r.name}</p>
                  <p className="text-xs text-mist">10 matches · entry {etbLabel(Number(r.entry_fee_units))}{r.lock_at ? ` · closes ${formatKickoff(r.lock_at)}` : ""}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-lilac">Prize pot</p>
                  <p className="text-lg font-extrabold">{etbLabel(pools[i]?.prize_fund_units ?? 0)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Leagues */}
      <section className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <h2 className="mb-1 text-xl font-extrabold">Leagues we follow</h2>
        <p className="mb-5 text-sm text-mist">Every round and challenge is built from these leagues&apos; fixtures.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {followed.map((c) => {
            const games = byComp.get(c.name) ?? [];
            const next = games[0];
            return (
              <div key={c.code} className="overflow-hidden rounded-[1.5rem] border border-white/10 bg-card/70">
                <div className={`flex h-20 items-center justify-center bg-gradient-to-br sm:h-24 ${c.hue}`}>
                  <span className="text-3xl font-extrabold tracking-tight text-white/95 drop-shadow">{c.code}</span>
                </div>
                <div className="p-3 text-center sm:p-4">
                  <p className="text-sm font-extrabold sm:text-base">{c.label}</p>
                  <p className="text-xs text-mist">{c.country}</p>
                  <span
                    className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      games.length ? "bg-emerald-300/15 text-emerald-100" : "bg-white/10 text-mist"
                    }`}
                  >
                    {games.length > 0 && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />}
                    {games.length ? `${games.length} upcoming` : "No matches this week"}
                  </span>
                  {next && <p className="mt-1.5 text-[11px] text-mist">Next: {formatKickoff(next.kickoff_at)}</p>}
                </div>
              </div>
            );
          })}
        </div>
        {notYet.length > 0 && (
          <p className="mt-4 text-xs text-mist">
            Also available as we grow: {notYet.map((c) => c.label).join(", ")}.
          </p>
        )}
      </section>

      {/* Fixtures */}
      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <h2 className="mb-1 text-xl font-extrabold">Upcoming fixtures</h2>
        <p className="mb-5 text-sm text-mist">All times are Ethiopia time. Tap a match for our prediction.</p>
        {upcoming.length === 0 ? (
          <p className="rounded-2xl bg-card/60 p-5 text-sm text-mist">
            No fixtures in the next 10 days for the leagues we follow (international break or off-season). New matches appear here as soon as they are scheduled.
          </p>
        ) : (
          <div className="space-y-5">
            {[...days.values()].map((ms) => (
              <div key={ms[0].kickoff_at}>
                <p className="mb-2 text-xs font-bold uppercase tracking-widest text-lilac">{dayOf(ms[0].kickoff_at)}</p>
                <div className="space-y-2">
                  {ms.map((m) => (
                    <Link
                      key={m.id}
                      href={predictionPath(m)}
                      className="grid grid-cols-[3rem_1fr_auto_1fr] items-center gap-2 rounded-2xl border border-white/5 bg-card/50 px-3 py-3 hover:border-lilac/40 sm:px-4"
                    >
                      <span className="text-xs font-bold text-mist">{timeOf(m.kickoff_at)}</span>
                      <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                        <span className="truncate text-sm font-semibold">{m.home_team}</span>
                        <Crest src={m.home_crest} name={m.home_team} size={22} />
                      </span>
                      <span className="px-1 text-xs font-extrabold text-mist">vs</span>
                      <span className="flex min-w-0 items-center gap-2">
                        <Crest src={m.away_crest} name={m.away_team} size={22} />
                        <span className="truncate text-sm font-semibold">{m.away_team}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={loggedIn ? "/dashboard" : "/register"} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
            {loggedIn ? "Make your predictions" : "Join and predict"}
          </Link>
          <Link href="/predictions" className="inline-flex rounded-full border border-white/60 px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10">
            Our predictions
          </Link>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
