import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { JsonLd } from "@/components/JsonLd";
import { Crest, dayKeyOf, timeOf } from "@/components/MatchLine";
import { breadcrumbJsonLd, pageMeta } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { MATCH_COLS, predictionPath, type PredictionMatch } from "@/lib/predictions";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import { PRED, dateFmt } from "@/lib/i18n/predictions";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PRED[lang].hubMetaTitle, description: PRED[lang].hubMetaDescription, path: "/predictions", lang, translated: true });
}
export const dynamic = "force-dynamic";

export default async function PredictionsPage() {
  const lang = await getLang();
  const t = PRED[lang];
  const f = dateFmt(lang);
  const { supabase, loggedIn } = await getPublicContext();
  const from = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
  const to = new Date(Date.now() + 8 * 86400 * 1000).toISOString();

  const [{ data: previewed }, { data: roundRows }] = await Promise.all([
    supabase
      .from("matches")
      .select(`${MATCH_COLS}, match_previews!inner(pick_home, pick_away, verdict, verdict_am)`)
      .gte("kickoff_at", from)
      .lte("kickoff_at", to)
      .order("kickoff_at")
      .limit(60),
    supabase.from("rounds").select("id").in("status", ["open", "locked"]),
  ]);
  const roundIds = ((roundRows ?? []) as { id: number }[]).map((r) => r.id);
  const { data: roundMatches } = roundIds.length
    ? await supabase.from("matches").select(MATCH_COLS).in("round_id", roundIds).order("kickoff_at")
    : { data: [] };

  type Row = PredictionMatch & { match_previews?: { pick_home: number; pick_away: number; verdict: string; verdict_am?: string | null } | null };
  const byId = new Map<number, Row>();
  for (const m of (roundMatches ?? []) as Row[]) byId.set(m.id, m);
  for (const m of (previewed ?? []) as unknown as Row[]) {
    // one-to-one embed comes back as an object (older PostgREST: a one-item list)
    const raw = m.match_previews as unknown;
    const pv = (Array.isArray(raw) ? raw[0] : raw) as Row["match_previews"];
    byId.set(m.id, { ...m, match_previews: pv ?? null });
  }
  const all = [...byId.values()].sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  const days = new Map<string, Row[]>();
  for (const m of all) days.set(dayKeyOf(m.kickoff_at), [...(days.get(dayKeyOf(m.kickoff_at)) ?? []), m]);

  const tipped = all.filter((m) => m.match_previews);
  return (
    <div className="relative">
      <JsonLd data={breadcrumbJsonLd([{ name: t.home, path: lang === "am" ? "/am" : "" }, { name: t.predictions, path: localPath("/predictions", lang) }])} />
      {all.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: t.hubListName,
            itemListElement: all.map((m, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE_URL}${localPath(predictionPath(m), lang)}`, name: t.hubItem(m) })),
          }}
        />
      )}
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title={t.hubTitle} subtitle={t.hubSubtitle} image="/stadium.webp" />

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-12">
        <p className="mb-6 text-sm leading-relaxed text-mist">
          {tipped.length > 0
            ? t.hubTipped(tipped.slice(0, 3).map((m) => `${m.home_team} ${m.match_previews!.pick_home}-${m.match_previews!.pick_away} ${m.away_team}`).join(lang === "am" ? "፣ " : ", "), tipped.length - 3)
            : ""}
          {t.hubIntro}
        </p>

        {all.length === 0 && <p className="rounded-2xl bg-card/60 p-6 text-center text-mist">{t.hubEmpty}</p>}

        <div className="space-y-6">
          {[...days.values()].map((ms) => (
            <section key={ms[0].kickoff_at}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-widest text-lilac">{f.day(ms[0].kickoff_at)}</h2>
              <ul className="space-y-2">
                {ms.map((m) => {
                  const p = m.match_previews;
                  const done = m.status === "finished" && m.actual_home_score !== null;
                  return (
                    <li key={m.id}>
                      <Link href={localPath(predictionPath(m), lang)} className="block rounded-2xl border border-white/5 bg-card/50 px-3 py-3 transition hover:border-lilac/40 sm:px-4">
                        <div className="grid grid-cols-[3rem_1fr_auto_1fr] items-center gap-2">
                          <span className="text-xs font-bold text-mist">{timeOf(m.kickoff_at)}</span>
                          <span className="flex min-w-0 items-center justify-end gap-2 text-right">
                            <span className="truncate text-sm font-semibold">{m.home_team}</span>
                            <Crest src={m.home_crest} name={m.home_team} size={22} />
                          </span>
                          <span className={`min-w-14 rounded-xl px-2 py-1 text-center text-sm font-extrabold ${done ? "bg-white/10" : p ? "bg-lilac/20 text-lilac-soft" : "text-mist"}`}>
                            {done ? `${m.actual_home_score}-${m.actual_away_score}` : p ? `${p.pick_home}-${p.pick_away}` : "vs"}
                          </span>
                          <span className="flex min-w-0 items-center gap-2">
                            <Crest src={m.away_crest} name={m.away_team} size={22} />
                            <span className="truncate text-sm font-semibold">{m.away_team}</span>
                          </span>
                        </div>
                        {p && !done && <p className="mt-2 line-clamp-2 pl-[3.5rem] text-xs text-mist">{(lang === "am" && p.verdict_am) || p.verdict}</p>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-10 text-xs text-mist/70">{t.disclaimer}</p>
      </main>
      <SiteFooter />
    </div>
  );
}
