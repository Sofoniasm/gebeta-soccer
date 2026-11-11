import { PAGES } from "@/lib/i18n/pages";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import { getSiteSettings } from "@/lib/site-settings";
import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { CountUp } from "@/components/CountUp";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PAGES[lang].about.metaTitle, description: PAGES[lang].about.metaDescription, path: "/about", lang, translated: true });
}
export const dynamic = "force-dynamic";

const COLORS = ["text-lilac-soft", "text-[#f0b4c8]", "text-[#9fd8c0]", "text-[#f5c98a]"];

export default async function AboutPage() {
  const lang = await getLang();
  const t = PAGES[lang].about;
  const { loggedIn, stats } = await getPublicContext();
  const site = await getSiteSettings();
  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title={t.title} />

      <main>
        <section className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-center text-3xl font-extrabold">{t.what}</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {t.cards.map(([title, body], i) => (
              <div key={title} className="rounded-[2rem] border border-white/5 bg-card/60 p-8">
                <h3 className={`text-center text-2xl font-extrabold ${COLORS[i]}`}>{title}</h3>
                <p className="mt-4 leading-relaxed text-mist">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Numbers (admin switches this on in Admin -> Site once they look good) */}
        {site.show_public_stats && (
        <section className="relative overflow-hidden py-16">
          <div className="absolute inset-0 bg-gradient-to-r from-[#3a3166] via-[#4a3f86] to-[#2c2740]" />
          <div className="relative mx-auto max-w-6xl px-6 text-center">
            <h2 className="text-2xl font-extrabold">{t.numbers}</h2>
            <div className="mt-8 grid grid-cols-3 gap-3 sm:mt-10 sm:gap-8">
              {[
                [Number(stats.players), t.stats[0]],
                [Number(stats.predictions), t.stats[1]],
                [Number(stats.rounds), t.stats[2]],
              ].map(([n, label]) => (
                <div key={String(label)}>
                  <p className="font-mono text-3xl font-bold tracking-tight text-white sm:text-5xl"><CountUp value={Number(n)} suffix="" /></p>
                  <p className="mt-1 text-xs leading-snug text-white/80 sm:mt-2 sm:text-sm">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        )}

        {/* Story */}
        <section className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="text-2xl font-extrabold">{t.story}</h2>
          <div className="mt-6 space-y-4 leading-relaxed text-mist">
            {t.storyParas.map((para) => <p key={para}>{para}</p>)}
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href={loggedIn ? "/dashboard" : localPath("/register", lang)} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
              {loggedIn ? t.makePredictions : t.join}
            </Link>
            <Link href={localPath("/business", lang)} className="inline-flex rounded-full border border-white/60 px-7 py-3.5 text-xs font-bold uppercase tracking-widest hover:bg-white/10">
              {t.partner}
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
