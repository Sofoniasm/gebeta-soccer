import Link from "next/link";
import { predictionPath } from "@/lib/predictions";
import { getPublicContext, getPublicStats } from "@/lib/public";
import { getActiveRounds, getRoundPool } from "@/lib/rounds";
import { unitsToEtb, ETB_PER_UNIT, DEFAULT_HOUSE_CUT } from "@/lib/money";
import { POINTS } from "@/lib/scoring";
import { SectionTitle } from "@/components/ui";
import { formatKickoff } from "@/lib/format";
import { CountUp } from "@/components/CountUp";
import { FlowLines } from "@/components/FlowLines";
import { PhoneMockup } from "@/components/PhoneMockup";
import { HeroScene } from "@/components/HeroScene";
import { MatchTicker, type TickerMatch } from "@/components/MatchTicker";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ArrowRightIcon, BallIcon, SendIcon, ShieldIcon, StarIcon, TrophyIcon, WalletIcon } from "@/components/icons";
import { pageMeta, siteJsonLd } from "@/lib/seo";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import { HOME } from "@/lib/i18n/home";
import { getSiteSettings } from "@/lib/site-settings";
import { JsonLd } from "@/components/JsonLd";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: HOME[lang].metaTitle, description: HOME[lang].metaDescription, path: "", lang, translated: true });
}

export const dynamic = "force-dynamic";

const pill =
  "inline-flex items-center justify-center rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink shadow-lg shadow-lilac/20 transition hover:bg-lilac-soft";

export default async function Home() {
  const lang = await getLang();
  const t = HOME[lang];
  // Everything is loaded in two parallel batches (was ~8 calls one after another).
  type Featured = { id: number; home_team: string; away_team: string; kickoff_at: string; competition: string | null; home_crest?: string | null; away_crest?: string | null };
  const { supabase, loggedIn } = await getPublicContext();
  const nowIso = new Date().toISOString();
  const [site, active, { data: upcoming }] = await Promise.all([
    getSiteSettings(),
    getActiveRounds(supabase), // daily rounds: the one closing soonest comes first
    supabase
      .from("matches")
      .select("id, home_team, away_team, kickoff_at, competition, home_crest, away_crest")
      .eq("status", "scheduled")
      .gt("kickoff_at", nowIso)
      .neq("provider", "test")
      .order("kickoff_at", { ascending: true })
      .limit(12),
  ]);
  const activeRound = active[0] ?? null;
  const tickerMatches = (upcoming ?? []) as TickerMatch[];
  const [pool, roundFeatured, stats] = await Promise.all([
    activeRound ? getRoundPool(supabase, activeRound.id) : Promise.resolve(null),
    activeRound
      ? supabase
          .from("matches")
          .select("id, home_team, away_team, kickoff_at, competition, home_crest, away_crest")
          .eq("round_id", activeRound.id)
          .gt("kickoff_at", nowIso)
          .neq("provider", "test")
          .order("kickoff_at")
          .limit(3)
          .then((r) => (r.data ?? []) as Featured[])
      : Promise.resolve([] as Featured[]),
    site.show_public_stats ? getPublicStats(supabase) : Promise.resolve({ players: 0, predictions: 0, rounds: 0 }),
  ]);
  // Featured matches: this round's fixtures, else the next upcoming ones
  const featured: Featured[] = roundFeatured.length ? roundFeatured : ((upcoming ?? []) as Featured[]).slice(0, 3);

  const houseCut = activeRound ? Number(activeRound.house_cut) : DEFAULT_HOUSE_CUT;
  const prizePct = Math.round((1 - houseCut) * 100);
  const housePct = 100 - prizePct;
  const prizeEtb = pool ? unitsToEtb(pool.prize_fund_units) : 0;
  const examplePool = 100 * ETB_PER_UNIT;
  const ctaHref = loggedIn ? "/dashboard" : "/register";

  return (
    <div className="relative overflow-x-hidden">
      <JsonLd data={siteJsonLd()} />
      <FlowLines />
      <SiteHeader loggedIn={loggedIn} />

      {/* ------------------------------------------------ Hero: stadium photo, centred brand */}
      <section className="relative isolate overflow-hidden">
        <HeroScene />
        <div className="mx-auto flex max-w-5xl flex-col items-center px-6 pb-16 pt-14 text-center sm:pt-20 lg:pb-24">
          <p className="inline-flex items-center gap-2 rounded-full border border-lilac/30 bg-black/30 px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.25em] text-lilac-soft backdrop-blur">
            {t.badge}
          </p>
          <h1 className="mt-7 text-5xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-7xl">
            <span className="text-lilac">{t.h1.a}</span>{t.h1.b}
            <br />
            {t.h1.c}<span className="bg-gradient-to-r from-lilac-soft via-lilac to-[#8f80e6] bg-clip-text text-transparent">{t.h1.d}</span>
          </h1>
          <p className="mt-5 flex flex-wrap items-baseline justify-center gap-x-3 text-white/80">
            {site.show_public_stats && stats.players > 0 ? (
              <>
                {t.playedBefore} <span className="text-4xl font-extrabold tabular-nums text-white sm:text-5xl"><CountUp value={Number(stats.players)} suffix="" /></span> {t.playedAfter}
              </>
            ) : (
              <span className="text-lg">{t.tagline}</span>
            )}
          </p>
          <p className="mt-2 text-sm text-white/60">{t.sub(prizePct)}</p>

          <div className="mt-9 flex w-full max-w-md flex-col gap-3 sm:flex-row sm:justify-center">
            <Link href={ctaHref} className={`${pill} w-full sm:w-auto`}>
              {loggedIn ? t.makePredictions : t.createAccount}
            </Link>
            {!loggedIn && (
              <Link
                href="/login"
                className="inline-flex w-full items-center justify-center rounded-full border border-white/70 bg-black/20 px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-white backdrop-blur hover:bg-white/10 sm:w-auto"
              >
                {t.logIn}
              </Link>
            )}
          </div>

          {/* Prize pot */}
          <div className="mt-10 inline-flex items-center gap-4 rounded-full border border-white/10 bg-black/30 px-6 py-3 backdrop-blur-md">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-lilac opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-lilac" />
            </span>
            <span className="text-xs font-bold uppercase tracking-widest text-lilac-soft">{t.prizePot(activeRound?.name)}</span>
            <span className="text-xl font-extrabold text-white"><CountUp value={prizeEtb} /></span>
          </div>
        </div>

        {/* Popular this week */}
        {featured.length > 0 && (
          <div className="mx-auto max-w-6xl px-6 pb-16">
            <p className="mb-5 text-center text-xl font-bold text-white sm:text-2xl">{t.bigMatches}</p>
            <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible md:px-0 md:pb-0">
              {featured.map((m, i) => (
                <Link
                  key={i}
                  href={localPath(predictionPath(m), lang)}
                  className="group w-[78%] shrink-0 snap-center overflow-hidden rounded-[1.75rem] border md:w-auto border-white/10 bg-[#141022]/75 backdrop-blur-xl transition hover:-translate-y-1 hover:border-lilac/40"
                >
                  <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.04] px-5 py-3 text-xs">
                    <span className="font-bold uppercase tracking-widest text-lilac">{m.competition ?? t.football}</span>
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
                    {t.seePrediction}
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
        <section className="mt-12 rounded-[2rem] border border-white/5 bg-gradient-to-r from-card/80 via-[#3e3660]/80 to-card/80 px-3 py-5 backdrop-blur sm:rounded-[2.5rem] sm:px-6 sm:py-6">
          <div className="grid grid-cols-3 gap-2 divide-x divide-white/10 sm:gap-6">
            {[<WalletIcon key="w" size={26} />, <SendIcon key="s" size={26} />, <ShieldIcon key="h" size={26} />].map((icon, n) => ({ icon, title: t.info(ETB_PER_UNIT, prizePct)[n][0], text: t.info(ETB_PER_UNIT, prizePct)[n][1] })).map((i) => (
              <div key={i.title} className="flex flex-col items-center gap-2 px-1 text-center sm:flex-row sm:justify-center sm:gap-4 sm:px-4 sm:text-left">
                <span className="text-lilac-soft">{i.icon}</span>
                <div>
                  <p className="text-xs font-bold leading-tight sm:text-base">{i.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-mist sm:text-xs">{i.text}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ------------------------------------------------ Introduction */}
        <section id="how" className="grid scroll-mt-24 items-center gap-8 py-12 sm:gap-12 sm:py-20 lg:grid-cols-2">
          <div>
            <SectionTitle top={t.introTop} bottom={t.introBottom} />
            <p className="mt-6 text-sm leading-relaxed text-mist">
            {t.intro}
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
        <section id="prize" className="grid scroll-mt-24 items-center gap-8 sm:gap-12 lg:grid-cols-2">
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
                {activeRound ? t.livePool(activeRound.name) : t.prizePool}
              </p>
              <p className="mt-4 text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
                <CountUp value={prizeEtb} />
              </p>
              <p className="mt-3 text-sm text-mist">
                {pool && pool.entrants > 0
                  ? t.slipsPlaced(pool.entrants)
                  : activeRound
                    ? t.beFirst
                    : t.nextSoon}
              </p>
              <div className="h-40" />
              </div>
            </div>
          </div>

          <div>
            <SectionTitle top={t.aboutTop} bottom={t.aboutBottom} />
            <p className="mt-6 text-sm leading-relaxed text-mist">
              {t.prizeText(prizePct, housePct)}
            </p>
            <div className="mt-6 flex h-3 overflow-hidden rounded-full bg-white/10">
              <div className="bg-lilac" style={{ width: `${prizePct}%` }} />
              <div className="bg-[#5f539c]" style={{ width: `${housePct}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs font-semibold">
              <span className="text-lilac-soft">{t.prizeLegend(prizePct)}</span>
              <span className="text-mist">{t.houseLegend(housePct)}</span>
            </div>
            <p className="mt-6 rounded-2xl bg-ink/60 p-4 text-sm text-mist">
              {t.exampleA(ETB_PER_UNIT, examplePool.toLocaleString("en-US"))}{" "}
              <b className="text-white">{t.exampleB(Math.round(examplePool * (prizePct / 100)).toLocaleString("en-US"))}</b>{t.exampleC}
            </p>
            <Link href={ctaHref} className={`${pill} mt-8`}>
              {loggedIn ? t.joinRound : t.getInGame}
            </Link>
          </div>
        </section>

      </main>

      {/* ------------------------------------------------ Why play (full-width dark band) */}
      <section className="relative mt-14 overflow-hidden bg-[#16121f] py-14 sm:mt-20 sm:py-20">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/crowd.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover object-bottom opacity-70" />
        <div className="absolute inset-0 bg-gradient-to-b from-plum via-[#0b0912]/70 to-[#0b0912]/90" />
        <div className="animate-glow pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-lilac/15 blur-3xl" />
        <div className="animate-glow pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-[#6c5fb3]/20 blur-3xl [animation-delay:2.5s]" />
        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
            <SectionTitle top={t.whyTop} bottom={t.whyBottom} />
            <p className="text-sm leading-relaxed text-mist">
              {t.why}
            </p>
          </div>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-12 sm:gap-4 lg:grid-cols-4">
            {[<BallIcon key="b" size={30} />, <TrophyIcon key="t" size={30} />, <StarIcon key="s" size={30} />, <ShieldIcon key="h" size={30} />].map((icon, n) => ({ icon, title: t.cards(prizePct)[n][0], text: t.cards(prizePct)[n][1] })).map((c) => (
              <div key={c.title} className="rounded-[1.5rem] border border-white/5 bg-card/60 p-4 text-center transition sm:rounded-[2rem] sm:p-6 duration-300 hover:-translate-y-2 hover:border-lilac/30 hover:bg-card">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-4 sm:h-20 sm:w-20 border-plum bg-gradient-to-br from-lilac to-[#6c5fb3] text-ink shadow-lg shadow-black/30">
                  {c.icon}
                </div>
                <p className="mt-3 text-xs font-extrabold uppercase tracking-widest sm:mt-5 sm:text-sm">{c.title}</p>
                <p className="mt-1.5 text-xs leading-snug text-mist sm:mt-2 sm:text-sm">{c.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
        {/* ------------------------------------------------ Scoring */}
        <section id="scoring" className="scroll-mt-24 py-14 sm:py-20">
          <SectionTitle top={t.scoringTop} bottom={t.scoringBottom} />
          <div className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-4 lg:grid-cols-4">
            {[
              [POINTS.EXACT, t.scoring[0][0], t.scoring[0][1]],
              [POINTS.CLOSE, t.scoring[1][0], t.scoring[1][1]],
              [POINTS.RESULT, t.scoring[2][0], t.scoring[2][1]],
              [POINTS.WRONG, t.scoring[3][0], t.scoring[3][1]],
            ].map(([pts, label, ex]) => (
              <div key={String(label)} className="rounded-[1.5rem] border border-white/5 bg-card/60 p-4 transition duration-300 hover:-translate-y-2 hover:border-lilac/30 sm:rounded-[2rem] sm:p-6">
                <p className="text-3xl font-extrabold text-lilac sm:text-4xl">{pts}</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-mist sm:text-xs">{t.points}</p>
                <p className="mt-3 text-sm font-bold sm:mt-4 sm:text-base">{label}</p>
                <p className="mt-1 text-xs leading-snug text-mist sm:text-sm">{ex}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-6">
            <div>
              <p className="text-lg font-extrabold">{t.slam}</p>
              <p className="text-sm text-mist">{t.slamParts[0]} <b className="text-white">+1</b> {t.slamParts[1]} <b className="text-white">+2</b> {t.slamParts[2]} <b className="text-white">+3</b></p>
            </div>
            <p className="text-xs text-mist">{t.bar}</p>
          </div>
        </section>

        {/* ------------------------------------------------ CTA */}
        {!loggedIn && (
          <section className="relative mb-20 overflow-hidden rounded-[3rem] px-6 py-20 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/stadium.webp" alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <div className="animate-shimmer absolute inset-0 bg-[linear-gradient(110deg,rgba(95,83,156,0.85),rgba(157,143,230,0.6),rgba(95,83,156,0.85),rgba(157,143,230,0.6))] bg-[length:200%_100%]" />
            <div className="relative">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{t.ready}</h2>
            <p className="mt-3 text-white/80">{t.readySub}</p>
            <Link
              href="/register"
              className="mt-8 inline-flex items-center justify-center rounded-full bg-ink px-8 py-4 text-xs font-bold uppercase tracking-widest text-white transition hover:bg-black"
            >
              {t.createAccount}
            </Link>
            </div>
          </section>
        )}
      </div>

      <SiteFooter />
    </div>
  );
}
