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
import { getLang } from "@/lib/i18n-server";
import { localPath, type Lang } from "@/lib/i18n";
import { PRED, dateFmt } from "@/lib/i18n/predictions";
import { MATCH_COLS, idFromSlug, isIndexable, predictionPath, type MatchPreview, type PickSplit, type PredictionMatch } from "@/lib/predictions";

export const dynamic = "force-dynamic";

type Preview = MatchPreview & { verdict_am?: string | null; body_am?: string | null };

async function load(slug: string) {
  const id = idFromSlug(slug);
  if (!id) return null;
  const { supabase, loggedIn } = await getPublicContext();
  const { data: m } = await supabase.from("matches").select(MATCH_COLS).eq("id", id).maybeSingle();
  if (!m) return null;
  const match = m as PredictionMatch;
  const [{ data: pv }, { data: round }, { data: split }] = await Promise.all([
    supabase.from("match_previews").select("*").eq("match_id", id).maybeSingle(),
    match.round_id ? supabase.from("rounds").select("name, status").eq("id", match.round_id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.rpc("get_match_pick_split", { p_match_id: id }).maybeSingle(),
  ]);
  const preview = (pv as Preview | null) ?? null;
  const r = round as { name: string; status: string } | null;
  const roundIsLive = !!r && ["open", "locked", "settled"].includes(r.status);
  const s = split as PickSplit | null;
  return {
    supabase,
    loggedIn,
    match,
    preview,
    round: r,
    split: s ? { ...s, picks: Number(s.picks ?? 0) } : null,
    indexable: isIndexable(match, preview, roundIsLive),
  };
}

/** Admin text in the page's language (Amharic falls back to English if not written). */
function previewText(p: Preview, lang: Lang) {
  return {
    verdict: (lang === "am" && p.verdict_am) || p.verdict,
    body: (lang === "am" && p.body_am) || p.body,
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getLang();
  const t = PRED[lang];
  const f = dateFmt(lang);
  const d = await load(slug);
  if (!d) return { title: `${t.notFound} | GebetaSoccer`, robots: { index: false } };
  const { match: m, preview } = d;
  const finished = m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null;
  const title = finished ? t.titleFinished(m, m.actual_home_score!, m.actual_away_score!) : t.titleUpcoming(m, f.short(m.kickoff_at));
  const description = preview
    ? t.descPreview(m, preview.pick_home, preview.pick_away, previewText(preview, lang).verdict).slice(0, 300)
    : t.descNone(m, f.long(m.kickoff_at), f.clock(m.kickoff_at), m.competition);
  // Share image comes from ./opengraph-image.tsx (file-based metadata wins over the default).
  const meta = pageMeta({ title, description, path: predictionPath(m), type: "article", publishedTime: preview?.created_at, lang, translated: true });
  return d.indexable ? meta : { ...meta, robots: { index: false, follow: true } };
}

export default async function MatchPredictionPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lang = await getLang();
  const t = PRED[lang];
  const f = dateFmt(lang);
  const d = await load(slug);
  if (!d) notFound();
  const { supabase, loggedIn, match: m, preview, round, split } = d;
  const path = predictionPath(m);
  if (`/predictions/${slug}` !== path) permanentRedirect(localPath(path, lang));
  const here = localPath(path, lang);
  const text = preview ? previewText(preview, lang) : null;

  const finished = m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null;
  const calledOff = m.status === "postponed" || m.status === "cancelled";
  const tipPoints = preview && finished ? calculateMatchPoints(preview.pick_home, preview.pick_away, m.actual_home_score!, m.actual_away_score!) : null;
  const kickoffLine = t.kickoffLine(f.long(m.kickoff_at), f.clock(m.kickoff_at));
  const playHref = loggedIn ? (m.round_id && round?.status === "open" ? "/dashboard" : "/challenges/new") : "/register";

  // Related matches for internal links: same week, with a published preview
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
    ? t.answerFinished(m, m.actual_home_score!, m.actual_away_score!) +
      (preview ? t.answerReview(preview.pick_home, preview.pick_away, tipPoints === POINTS.EXACT ? "exact" : tipPoints && tipPoints > 0 ? "result" : "none") : "")
    : preview
      ? t.answerPreview(m, preview.pick_home, preview.pick_away, t.outcome(preview.pick_home, preview.pick_away, m))
      : t.answerNone(m, kickoffLine);

  const faq: [string, string][] = [
    [
      t.qPrediction(m),
      preview && text
        ? t.aPrediction(m, preview.pick_home, preview.pick_away, t.confidence[preview.confidence], text.verdict)
        : split?.top_score && split.top_score_pct !== null
          ? t.aPopular(split.top_score, Number(split.top_score_pct))
          : t.aNoTip,
    ],
    [t.qWhen(m), t.aWhen(kickoffLine, m.competition)],
    [t.qHow(m), t.aHow(Boolean(m.round_id))],
  ];
  if (finished) faq.unshift([t.qScore(m), t.aScore(m, m.actual_home_score!, m.actual_away_score!)]);

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
          url: `${SITE_URL}${here}`,
          inLanguage: lang,
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
          inLanguage: lang,
          mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        }}
      />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t.home, path: lang === "am" ? "/am" : "" },
          { name: t.predictions, path: localPath("/predictions", lang) },
          { name: `${m.home_team} ${t.vs} ${m.away_team}`, path: here },
        ])}
      />
      <SiteHeader loggedIn={loggedIn} />

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <nav className="mb-4 text-xs text-mist" aria-label="Breadcrumb">
          <Link href={localPath("/", lang)} className="hover:text-white">{t.home}</Link> ›{" "}
          <Link href={localPath("/predictions", lang)} className="hover:text-white">{t.predictions}</Link> ›{" "}
          <span className="text-white">{m.home_team} {t.vs} {m.away_team}</span>
        </nav>

        <h1 className="text-2xl font-extrabold leading-tight sm:text-4xl">{t.h1(m, finished)}</h1>

        {/* Answer first */}
        <section className="mt-5 rounded-[1.75rem] border border-lilac/30 bg-gradient-to-br from-lilac/15 via-card to-ink p-5 sm:p-6">
          <p className="text-[15px] leading-relaxed text-white sm:text-lg">
            <b>{answer}</b> {text && !finished && text.verdict}
          </p>
          <p className="mt-3 text-xs text-mist">
            {m.competition ? `${m.competition} · ` : ""}
            {t.kickoff} {kickoffLine}
            {preview && !finished && ` · ${t.confidence[preview.confidence]}`}
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-mist">{t.ourTip}</p>
                </>
              ) : (
                <p className="text-lg font-extrabold text-mist">VS</p>
              )}
              {calledOff && <p className="mt-1 text-xs font-bold uppercase text-amber-200">{t.status[m.status] ?? m.status}</p>}
              {m.status === "live" && <p className="mt-1 animate-pulse text-xs font-bold text-rose-300">{t.live}</p>}
            </div>
            <div className="flex flex-col items-center gap-2 text-center">
              <Crest src={m.away_crest} name={m.away_team} size={56} />
              <span className="text-sm font-bold">{m.away_team}</span>
            </div>
          </div>
          {finished && preview && tipPoints !== null && (
            <p className="mt-4 rounded-2xl bg-ink/50 p-3 text-center text-sm text-mist">{t.tipScored(preview.pick_home, preview.pick_away, tipPoints)}</p>
          )}
        </section>

        {/* What GebetaSoccer players think */}
        {split && split.picks > 0 && (
          <section className="mt-5 rounded-[1.75rem] border border-white/5 bg-card/60 p-5">
            <h2 className="text-lg font-extrabold">{t.splitTitle}</h2>
            {split.home_win !== null ? (
              <>
                <div className="mt-4 flex h-3 overflow-hidden rounded-full bg-white/10">
                  <div className="bg-lilac" style={{ width: `${split.home_win}%` }} />
                  <div className="bg-white/40" style={{ width: `${split.draw}%` }} />
                  <div className="bg-[#5f539c]" style={{ width: `${split.away_win}%` }} />
                </div>
                <div className="mt-2 grid grid-cols-3 text-xs">
                  <span><b className="text-white">{split.home_win}%</b> {m.home_team}</span>
                  <span className="text-center"><b className="text-white">{split.draw}%</b> {t.draw}</span>
                  <span className="text-right"><b className="text-white">{split.away_win}%</b> {m.away_team}</span>
                </div>
                {split.top_score && <p className="mt-3 text-sm text-mist">{t.splitLine(split.picks, split.top_score, Number(split.top_score_pct))}</p>}
              </>
            ) : (
              <p className="mt-2 text-sm text-mist">{t.splitHidden(split.picks)}</p>
            )}
          </section>
        )}

        {/* Analysis */}
        {text?.body && (
          <section className="mt-8 space-y-5 text-[15px] leading-relaxed text-[#d9d5ea] sm:text-base">
            <h2 className="text-xl font-extrabold text-white">{t.analysis}</h2>
            <NewsBody body={text.body} />
          </section>
        )}

        {/* CTA */}
        {!finished && !calledOff && (
          <section className="mt-8 rounded-[1.75rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-5 text-center sm:p-6">
            <p className="text-lg font-extrabold">{t.ctaTitle}</p>
            <p className="mt-1 text-sm text-mist">{m.round_id ? t.ctaRound : t.ctaChallenge}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href={playHref} className="rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
                {loggedIn ? t.predictThis : t.joinFree}
              </Link>
              {loggedIn && (
                <Link href={`/challenges/new?match=${m.id}`} className="rounded-full border border-white/60 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">
                  {t.challenge}
                </Link>
              )}
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="mt-10">
          <h2 className="mb-4 text-xl font-extrabold">{t.faqTitle(m)}</h2>
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
            <h2 className="mb-3 text-lg font-extrabold">{t.more}</h2>
            <ul className="grid gap-2 sm:grid-cols-2">
              {related.map((r) => (
                <li key={r.id}>
                  <Link href={localPath(predictionPath(r), lang)} className="block rounded-2xl border border-white/5 bg-card/50 px-4 py-3 text-sm hover:border-lilac/40">
                    <b>{r.home_team} {t.vs} {r.away_team}</b>
                    <span className="block text-xs text-mist">{f.long(r.kickoff_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="mt-10 text-xs text-mist/70">
          {t.disclaimer} <Link href={localPath("/how-to-play", lang)} className="underline">{t.howItWorks}</Link>
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
