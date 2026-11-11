import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { formatKickoff } from "@/lib/format";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";

export const metadata = { title: "Tournaments · GebetaSoccer" };
export const dynamic = "force-dynamic";

// Competitions available on our football data plan. `name` must match the
// competition name the data provider uses.
const COMPETITIONS = [
  { code: "PL", name: "Premier League", country: "England", hue: "from-[#6d5bd0] to-[#3b2f80]" },
  { code: "CL", name: "UEFA Champions League", country: "Europe", hue: "from-[#4a5bd6] to-[#1f2a73]" },
  { code: "PD", name: "Primera Division", label: "La Liga", country: "Spain", hue: "from-[#c0566b] to-[#6b2335]" },
  { code: "SA", name: "Serie A", country: "Italy", hue: "from-[#3d8bd1] to-[#1b4570]" },
  { code: "BL1", name: "Bundesliga", country: "Germany", hue: "from-[#d0564f] to-[#6e2420]" },
  { code: "FL1", name: "Ligue 1", country: "France", hue: "from-[#5a8f6a] to-[#244331]" },
  { code: "ELC", name: "Championship", country: "England", hue: "from-[#8a7bd8] to-[#463c86]" },
  { code: "DED", name: "Eredivisie", country: "Netherlands", hue: "from-[#e08a45] to-[#7a431a]" },
  { code: "PPL", name: "Primeira Liga", country: "Portugal", hue: "from-[#3fa37a] to-[#1a5139]" },
  { code: "BSA", name: "Campeonato Brasileiro Série A", label: "Brasileirão", country: "Brazil", hue: "from-[#c9b240] to-[#5f531a]" },
  { code: "WC", name: "FIFA World Cup", label: "World Cup", country: "International", hue: "from-[#b38a3e] to-[#5a4219]" },
  { code: "EC", name: "European Championship", label: "Euros", country: "Europe", hue: "from-[#4d7fd6] to-[#213a6d]" },
];

export default async function TournamentsPage() {
  const { supabase, loggedIn } = await getPublicContext();

  const { data } = await supabase
    .from("matches")
    .select("competition, home_team, away_team, kickoff_at")
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at")
    .limit(300);
  const upcoming = (data ?? []) as { competition: string | null; home_team: string; away_team: string; kickoff_at: string }[];

  const byComp = new Map<string, typeof upcoming>();
  for (const m of upcoming) {
    const k = m.competition ?? "";
    byComp.set(k, [...(byComp.get(k) ?? []), m]);
  }

  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title="Tournaments" subtitle="One weekly round of 10 big matches, picked from the best football leagues in the world." />

      <section className="bg-gradient-to-b from-plum to-[#231e36] py-16">
        <div className="mx-auto max-w-6xl px-6">
          <p className="mb-10 text-center text-sm text-mist">Live leagues feed this week&apos;s round. More leagues switch on as GebetaSoccer grows.</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {COMPETITIONS.map((c) => {
              const games = byComp.get(c.name) ?? [];
              const live = games.length > 0;
              const title = c.label ?? c.name;
              return (
                <div key={c.code} className="group overflow-hidden rounded-[1.75rem] border border-white/10 bg-card/70 transition hover:-translate-y-1 hover:border-lilac/40">
                  <div className={`flex h-28 items-center justify-center bg-gradient-to-br ${c.hue}`}>
                    <span className="text-4xl font-extrabold tracking-tight text-white/95 drop-shadow">{c.code}</span>
                  </div>
                  <div className="p-4 text-center">
                    <p className="font-extrabold">{title}</p>
                    <p className="text-xs text-mist">{c.country}</p>
                    <span
                      className={`mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-widest ${
                        live ? "bg-emerald-300/15 text-emerald-100" : "bg-white/10 text-mist"
                      }`}
                    >
                      {live && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />}
                      {live ? `${games.length} upcoming` : "Coming soon"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Upcoming fixtures */}
      <section className="mx-auto max-w-6xl px-6 py-16">
        <h2 className="text-2xl font-extrabold">Upcoming fixtures</h2>
        {upcoming.length === 0 ? (
          <p className="mt-4 text-sm text-mist">Fixtures appear here as soon as the next week&apos;s matches are loaded.</p>
        ) : (
          <div className="mt-6 overflow-hidden rounded-[2rem] border border-white/5 bg-card/60">
            {upcoming.slice(0, 12).map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0 sm:grid-cols-[10rem_1fr_auto]">
                <span className="hidden text-xs font-bold uppercase tracking-widest text-lilac sm:block">{m.competition}</span>
                <span className="font-semibold">{m.home_team} <span className="text-mist">vs</span> {m.away_team}</span>
                <span className="text-right text-xs text-mist">{formatKickoff(m.kickoff_at)}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 text-center">
          <Link href={loggedIn ? "/dashboard" : "/register"} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
            {loggedIn ? "Make your predictions" : "Join and predict"}
          </Link>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
