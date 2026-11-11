import Link from "next/link";
import { Wordmark } from "./Logo";
import { TELEGRAM_URL } from "@/lib/config";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import { COMMON } from "@/lib/i18n/common";

export async function SiteFooter() {
  const lang = await getLang();
  const t = COMMON[lang];
  const L = t.links;
  const cols: { title: string; links: [string, string][] }[] = [
    { title: t.cols.play, links: [[L.createAccount, "/register"], [L.logIn, "/login"], [L.myPredictions, "/dashboard"], [L.tournaments, "/tournaments"]] },
    { title: t.cols.learn, links: [[L.predictions, "/predictions"], [L.howToPlay, "/how-to-play"], [L.news, "/news"], [L.getApp, "/apps"], [L.terms, "/terms"]] },
    { title: t.cols.company, links: [[L.about, "/about"], [L.business, "/business"], [L.telegram, TELEGRAM_URL]] },
  ];
  return (
    <footer className="relative border-t border-white/5 bg-ink">
      <div className="mx-auto grid max-w-7xl grid-cols-3 gap-x-4 gap-y-8 px-6 py-10 sm:gap-10 sm:py-14 lg:grid-cols-5 lg:px-10">
        <div className="col-span-3 lg:col-span-2">
          <Wordmark className="text-2xl" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist">{t.footerTagline}</p>
          <span className="mt-5 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-mist">{t.playResponsibly}</span>
        </div>
        {cols.map((c) => (
          <div key={c.title}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-lilac sm:text-xs">{c.title}</p>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-snug text-mist sm:mt-4 sm:space-y-2 sm:text-sm">
              {c.links.map(([label, href]) => (
                <li key={href}>
                  {href.startsWith("http") ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-white">{label}</a>
                  ) : (
                    <Link href={localPath(href, lang)} className="hover:text-white">{label}</Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-5 text-xs text-mist/70 sm:flex-row lg:px-10">
          <p>© {new Date().getFullYear()} GebetaSoccer</p>
          <p>{t.bottomNote}</p>
        </div>
      </div>
    </footer>
  );
}
