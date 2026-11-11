import { PAGES } from "@/lib/i18n/pages";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { getSiteSettings, telegramHandle } from "@/lib/site-settings";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { PhoneMockup } from "@/components/PhoneMockup";
import { SendIcon } from "@/components/icons";
import { SITE_HOST } from "@/lib/site";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PAGES[lang].apps.metaTitle, description: PAGES[lang].apps.metaDescription, path: "/apps", lang, translated: true });
}


function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
      <p className="text-lg font-extrabold">{title}</p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm text-mist">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac text-xs font-extrabold text-ink">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function AppsPage() {
  const lang = await getLang();
  const t = PAGES[lang].apps;
  const site = await getSiteSettings();
  const { loggedIn } = await getPublicContext();
  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title={t.title} subtitle={t.subtitle} />

      <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Steps title="Android (Chrome)" steps={t.android(SITE_HOST)} />
            <Steps title="iPhone (Safari)" steps={t.iphone(SITE_HOST)} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-6">
            <div>
              <p className="text-lg font-extrabold">{t.telegramTitle}</p>
              <p className="text-sm text-mist">{t.telegramText(Boolean(site.telegram_channel))}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={site.telegram_support} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
                <SendIcon size={14} /> {t.support}
              </a>
              {site.telegram_channel && (
                <a href={site.telegram_channel} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full border border-white/60 px-6 py-3 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10">
                  {t.announcements}
                </a>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={loggedIn ? "/dashboard" : localPath("/register", lang)} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
              {loggedIn ? t.openMine : t.playWeb}
            </Link>
          </div>
        </div>
        <div className="relative mx-auto hidden w-80 lg:block">
          <div className="absolute inset-0 rotate-3 rounded-[3.5rem] bg-gradient-to-br from-lilac/70 to-[#5b4f96]/60" />
          <div className="relative flex justify-center rounded-[3.5rem] border border-white/10 bg-gradient-to-br from-[#9d8fe6] to-[#5f539c] px-6 py-10">
            <PhoneMockup className="animate-float" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
