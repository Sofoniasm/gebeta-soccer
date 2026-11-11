import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { getPublicContext } from "@/lib/public";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { JsonLd } from "@/components/JsonLd";
import { NewsBody } from "@/components/NewsBody";
import { Crest } from "@/components/MatchLine";
import { BRAND, breadcrumbJsonLd, pageMeta } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { POINTS, calculateMatchPoints } from "@/lib/scoring";
import {
  CONFIDENCE_LABEL,
  MATCH_COLS,
  idFromSlug,
  isIndexable,
  outcomeText,
  predictionPath,
  type MatchPreview,
  type PickSplit,
  type PredictionMatch,
} from "@/lib/predictions";

export const dynamic = "force-dynamic";

const TZ = "Africa/Addis_Ababa";
const longDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));
const shortDate = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
const clock = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

async function load(slug: string) {
  const id = idFromSlug(slug);
  if (!id) return null;
  const { supabase, loggedIn } = await getPublicContext();
  const { data: m } = await supabase.from("matches").select(MATCH_COLS).eq("id", id).maybeSingle();
  if (!m) return null;
  const match = m as PredictionMatch;
  const [{ data: pv }, { data: round }, { data: split }] = await Promise.all([
    supabase.from("match_previews").select("match_id, pick_home, pick_away, confidence, verdict, body, updated_at, created_at").eq("match_id", id).maybeSingle(),
    match.round_id ? supabase.from("rounds").select("name, status").eq("id", match.round_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("get_match_pick_split", { p_match_id: id }).maybeSingle(),
  ]);
  const preview = (pv as MatchPreview | null) ?? null;
  const r = round as { name: string; status: string } | null;
  const roundIsLive = !!r && ["open", "locked", "settled"].includes(r.status);
  const s = split as PickSplit | null;
  return {
    supabase,
    loggedIn,
    match,
    preview,
    round: r,
    roundIsLive,
    split: s ? { ...s, picks: Number(s.picks ?? 0) } : null,
    indexable: isIndexable(match, preview, roundIsLive),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) return { title: "Match not found | GebetaSoccer", robots: { index: false } };
  const { match: m, preview } = d;
  const path = predictionPath(m);
  const finished = m.status === "finished" && m.actual_home_score !== null;
  const title = finished
    ? `${m.home_team} vs ${m.away_team} ${m.actual_home_score}-${m.actual_away_score}: Result & Prediction Review`
    : `${m.home_team} vs ${m.away_team} Prediction & Score Tip (${shortDate(m.kickoff_at)})`;
  const description = preview
    ? `Our prediction: ${m.home_team} ${preview.pick_home}-${preview.pick_away} ${m.away_team}. ${preview.verdict}`.slice(0, 300)
    : `${m.home_team} vs ${m.away_team} kicks off ${longDate(m.kickoff_at)} at ${clock(m.kickoff_at)} Ethiopia time${m.competition ? ` (${m.competition})` : ""}. Predict the score on GebetaSoccer and win in birr.`;
  // Share image comes from ./opengraph-image.tsx (file-based metadata wins over the default).
  const meta = pageMeta({ title, description, path, type: "article", publishedTime: preview?.created_at });
  return d.indexable ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function MatchPredictionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const d = await load(slug);
  if (!d) notFound();
  const { supabase, loggedIn, match: m, preview, round, split } = d;
  const path = predictionPath(m);
  if (`/predictions/${slug}` !== path) permanentRedirect(path);

  const finished = m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null;
  const calledOff = m.status === "postponed" || m.status === "cancelled";
  const tipPoints = preview && finished ? calculateMatchPoints(preview.pick_home, preview.pick_away, m.actual_home_score!, m.actual_away_score!) : null;
  const kickoffLine = `${longDate(m.kickoff_at)}, ${clock(m.kickoff_at)} Ethiopia time (EAT)`;
  const playHref = loggedIn ? (m.round_id && round?.status === "open" ? "/dashboard" : "/challenges/new") : "/register";

  // Related matches for internal links: same week, with a preview or in a round
  const from = new Date(Date.now() - 2 * 86400 * 1000).toISOString();
  const { data: relData } = await supabase
    .from("matches")
    .select("id, home_team, away_team, kickoff_at, round_id, match_previews!inner(match_id)")
    .neq("id", m.id)
    .gte("kickoff_at", from)
    .order("kickoff_at")
    .limit(6);
  const related = (relData ?? []) as { id: number; home_team: string; away_team: string; kickoff_at: string }[];

  // The answer, first: what a search user or AI assistant wants to quote.
  const answer = finished
    ? `${m.home_team} ${m.actual_home_score}-${m.actual_away_score} ${m.away_team} (full time).` +
      (preview ? ` Our pre-match prediction was ${preview.pick_home}-${preview.pick_away}${tipPoints === POINTS.EXACT ? ", the exact score" : tipPoints && tipPoints > 0 ? ", the right result" : ""}.` : "")
    : preview
      ? `GebetaSoccer prediction: ${m.home_team} ${preview.pick_home}-${preview.pick_away} ${m.away_team} (${outcomeText(preview.pick_home, preview.pick_away, m)}).`
      : `${m.home_team} vs ${m.away_team} kicks off on ${kickoffLine}.`;

  const faq: [string, string][] = [
    [
      `What is the prediction for ${m.home_team} vs ${m.away_team}?`,
      preview
        ? `GebetaSoccer predicts ${m.home_team} ${preview.pick_home}-${preview.pick_away} ${m.away_team} (${CONFIDENCE_LABEL[preview.confidence].toLowerCase()}). ${preview.verdict}`
        : split?.top_score
          ? `The most popular score among GebetaSoccer players was ${split.top_score} (${split.top_score_pct}% of picks).`
          : `No tip has been published yet. Players can predict the exact score on GebetaSoccer until kickoff.`,
    ],
    [`When does ${m.home_team} vs ${m.away_team} kick off in Ethiopia?`, `${kickoffLine}${m.competition ? `, ${m.competition}` : ""}.`],
    [
      `How do I predict ${m.home_team} vs ${m.away_team} and win?`,
      `Create a free GebetaSoccer account and predict the score. An exact score earns ${POINTS.EXACT} points, a close score ${POINTS.CLOSE} and the right result ${POINTS.RESULT}. ${
        m.round_id ? "This match is part of our weekly 10-match round, where the top slip with more than 15 points wins 70% of the pool." : "You can also put it in a private challenge against friends; the winner takes 90% of the stakes."
      }`,
    ],
  ];
  if (finished) faq.unshift([`What was the score in ${m.home_team} vs ${m.away_team}?`, `${m.home_team} ${m.actual_home_score}-${m.actual_away_score} ${m.away_team}.`]);

  const statusLd = calledOff
    ? m.status === "postponed" ? "https://schema.org/EventPostponed" : "https://schema.org/EventCancelled"
    : "https://schema.org/EventScheduled";

  return (
    <div className="relative">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SportsEvent",
          name: `${m.home_team} vs ${m.away_team}`,
          sport: "Soccer",
          startDate: m.kickoff_at,
          eventStatus: statusLd,
          url: `${SITE_URL}${path}`,
          ...(m.competition ? { superEvent: { "@type": "SportsEvent", name: m.competition } } : {}),
          homeTeam: { "@type": "SportsTeam", name: m.home_team, ...(m.home_crest ? { logo: m.home_crest } : {}) },
          awayTeam: { "@type": "SportsTeam", name: m.away_team, ...(m.away_crest ? { logo: m.away_crest } : {}) },
          competitor: [
            { "@type": "SportsTeam", name: m.home_team },
            { "@type": "SportsTeam", name: m.away_team },
          ],
          description: answer,
          organizer: { "@id": `${SITE_URL}/#organization`, "@type": "Organization", name: BRAND },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        }}
      />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "" }, { name: "Predictions", path: "/predictions" }, { name: `${m.home_team} vs ${m.away_team}`, path }])} />
      <SiteHeader loggedIn={loggedIn} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="mb-4 text-xs text-mist" aria-label="Breadcrumb">
          <Link href="/" className="hover:text-white">Home</Link> › <Link href="/predictions" className="hover:text-white">Predictions</Link> ›{" "}
          <span className="text-white">{m.home_team} vs {m.away_team}</span>
        </nav>

        <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">
          {m.home_team} vs {m.away_team} {finished ? "result & prediction review" : "prediction"}
        </h1>

        {/* Answer first */}
        <section className="mt-5 rounded-[1.75rem] border border-lilac/30 bg-gradient-to-br from-lilac/15 via-card to-ink p-5 sm:p-6">
          <p className="text-[15px] leading-relaxed text-white sm:text-lg">
            <b>{answer}</b> {preview && !finished && preview.verdict}
          </p>
          <p className="mt-3 text-xs text-mist">
            {m.competition ? `${m.competition} · ` : ""}Kickoff {kickoffLine}
            {preview && !finished && ` · ${CONFIDENCE_LABEL[preview.confidence]}`}
          </p>
        </section>

        {/* Match card */}
        <section className="mt-5 rounded-[1.75rem] border border-white/5 bg-card/60 p-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <div className="flex flex-col items-center gap-2 text-center">
              <Crest src={m.home_crest} name={m.home_team} size={56} />
              <span className="text-sm font-bold">{m.home_team}</span>
            </div>
            <div className="text-center">
              {finished ? (
                <p className="text-3xl font-extrabold">{m.actual_home_score} - {m.actual_away_score}</p>
              ) : preview ? (
                <>
                  <p className="text-3xl font-extrabold text-lilac-soft">{preview.pick_home} - {preview.pick_away}</p>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Our tip</p>
                </>
              ) : (
                <p className="text-lg font-extrabold text-mist">VS</p>
              )}
              {calledOff && <p className="mt-1 text-xs font-bold uppercase text-amber-200">{m.status}</p>}
              {m.status === "live" && <p className="mt-1 animate-pulse text-xs font-bold text-rose-300">LIVE</p>}
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <Crest src={m.away_crest} name={m.away_team} size={56} />
              <span className="text-sm font-bold">{m.away_team}</span>
            </div>
          </div>
          {finished && preview && (
            <p className="mt-4 rounded-2xl bg-ink/50 p-3 text-center text-sm text-mist">
              Our tip {preview.pick_home}-{preview.pick_away} scored <b className="text-white">{tipPoints} points</b> under GebetaSoccer rules.
            </p>
          )}
        </section>

        {/* What GebetaSoccer players think */}
        {split && split.picks > 0 && (
          <section className="mt-5 rounded-[1.75rem] border border-white/5 bg-card/60 p-5">
            <h2 className="text-lg font-extrabold">How GebetaSoccer players predicted it</h2>
            {split.home_win !== null ? (
              <>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="bg-lilac" style={{ width: `${split.home_win}%` }} />
                  <div className="bg-white/40" style={{ width: `${split.draw}%` }} />
                  <div className="bg-[#5f539c]" style={{ width: `${split.away_win}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-3 text-xs">
                  <span><b className="text-white">{split.home_win}%</b> {m.home_team}</span>
                  <span className="text-center"><b className="text-white">{split.draw}%</b> draw</span>
                  <span className="text-right"><b className="text-white">{split.away_win}%</b> {m.away_team}</span>
                </div>
                <p className="mt-3 text-sm text-mist">
                  {split.picks} predictions. Most popular score: <b className="text-white">{split.top_score}</b> ({split.top_score_pct}%).
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-mist">{split.picks} predictions so far. The split is revealed at kickoff.</p>
            )}
          </section>
        )}

        {/* Analysis */}
        {preview?.body && (
          <section className="mt-8 space-y-5 text-[15px] leading-relaxed text-[#d9d5ea] sm:text-base">
            <h2 className="text-xl font-extrabold text-white">Analysis</h2>
            <NewsBody body={preview.body} />
          </section>
        )}

        {/* CTA */}
        {!finished && !calledOff && (
          <section className="mt-8 rounded-[1.75rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-5 text-center sm:p-6">
            <p className="text-lg font-extrabold">Think you know the score?</p>
            <p className="mt-1 text-sm text-mist">
              {m.round_id ? "Predict this match in our weekly round and win the pool in birr." : "Challenge your friends on this match and win their stakes."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href={playHref} className="rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
                {loggedIn ? "Predict this match" : "Join GebetaSoccer free"}
              </Link>
              {loggedIn && (
                <Link href={`/challenges/new?match=${m.id}`} className="rounded-full border border-white/60 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">
                  Challenge a friend
                </Link>
              )}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-extrabold">{m.home_team} vs {m.away_team}: questions</h2>
          <div className="space-y-3">
            {faq.map(([q, a]) => (
              <div key={q} className="rounded-2xl border border-white/5 bg-card/50 p-4">
                <h3 className="text-sm font-extrabold text-white">{q}</h3>
                <p className="mt-1.5 text-sm text-mist">{a}</p>
              </div>
            ))}
          </div>
        </section>

        {related.length > 0 && (
          <section className="mt-10">
            <h2 className="mb-3 text-lg font-extrabold">More predictions</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={predictionPath(r)} className="block rounded-2xl border border-white/5 bg-card/50 px-4 py-3 text-sm hover:border-lilac/40">
                    <b>{r.home_team} vs {r.away_team}</b>
                    <span className="block text-xs text-mist">{longDate(r.kickoff_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 text-xs text-mist/70">
          Predictions are opinions for entertainment, not guarantees. 18+ only. Play responsibly. <Link href="/how-to-play" className="underline">How GebetaSoccer works</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
