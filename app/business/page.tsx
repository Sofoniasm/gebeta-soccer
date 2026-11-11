import { PAGES } from "@/lib/i18n/pages";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import { getPublicContext } from "@/lib/public";
import { getSiteSettings, telegramHandle } from "@/lib/site-settings";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { SendIcon, TrophyIcon, UsersIcon, StarIcon } from "@/components/icons";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PAGES[lang].business.metaTitle, description: PAGES[lang].business.metaDescription, path: "/business", lang, translated: true });
}

const OFFER_ICONS = [<TrophyIcon key="t" size={28} />, <UsersIcon key="u" size={28} />, <StarIcon key="s" size={28} />];

export default async function BusinessPage() {
  const lang = await getLang();
  const t = PAGES[lang].business;
  const site = await getSiteSettings();
  const { loggedIn, stats } = await getPublicContext();
  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title={t.title} subtitle={t.subtitle} image="/crowd.webp" />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-3 md:grid-cols-3 md:gap-5">
          {t.offers.map(([title, body], i) => ({ icon: OFFER_ICONS[i], title, body })).map((o) => (
            <div key={o.title} className="flex items-start gap-4 rounded-[1.5rem] border border-white/5 bg-card/60 p-5 md:block md:rounded-[2rem] md:p-8 md:text-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lilac to-[#6c5fb3] text-ink md:mx-auto md:h-16 md:w-16">{o.icon}</div>
              <div>
                <p className="text-base font-extrabold md:mt-5 md:text-lg">{o.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-mist md:mt-2">{o.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-6 rounded-[2rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-8">
          <div>
            <p className="text-2xl font-extrabold">{t.talk}</p>
            <p className="mt-1 text-mist">
              {site.show_public_stats && Number(stats.players) > 0 ? t.growing(Number(stats.players).toLocaleString("en-US")) : ""}
              {t.plan}
            </p>
          </div>
          <a href={site.telegram_support} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
            <SendIcon size={14} /> {t.contact}
          </a>
          {(site.contact_email || site.contact_phone) && (
            <p className="w-full text-sm text-mist">
              {site.contact_email && <>{t.email} <a href={`mailto:${site.contact_email}`} className="font-semibold text-lilac">{site.contact_email}</a></>}
              {site.contact_email && site.contact_phone && " · "}
              {site.contact_phone && <>{t.phone} <a href={`tel:${site.contact_phone.replace(/\s+/g, "")}`} className="font-semibold text-lilac">{site.contact_phone}</a></>}
            </p>
          )}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
