import Link from "next/link";
import { Wordmark } from "./Logo";
import { TELEGRAM_URL } from "@/lib/config";

const COLS = [
  { title: "Play", links: [["Create account", "/register"], ["Log in", "/login"], ["My predictions", "/dashboard"], ["Tournaments", "/tournaments"]] },
  { title: "Learn", links: [["How to play", "/how-to-play"], ["News", "/news"], ["Get the app", "/apps"], ["Terms", "/terms"]] },
  { title: "Company", links: [["About us", "/about"], ["For businesses", "/business"], ["Telegram", TELEGRAM_URL]] },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/5 bg-ink">
      <div className="mx-auto grid max-w-7xl grid-cols-3 gap-x-4 gap-y-8 px-6 py-10 sm:gap-10 sm:py-14 lg:grid-cols-5 lg:px-10">
        <div className="col-span-3 lg:col-span-2">
          <Wordmark className="text-2xl" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist">
            Ethiopia&apos;s weekly football prediction game, inspired by Gebeta, the board game of strategy we all grew up with.
          </p>
          <span className="mt-5 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-mist">18+ · Play responsibly</span>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-lilac sm:text-xs">{c.title}</p>
            <ul className="mt-3 space-y-2.5 text-[13px] leading-snug text-mist sm:mt-4 sm:space-y-2 sm:text-sm">
              {c.links.map(([label, href]) => (
                <li key={label}>
                  {href.startsWith("http") ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-white">{label}</a>
                  ) : (
                    <Link href={href} className="hover:text-white">{label}</Link>
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
          <p>18+ only · Only stake what you can afford to lose.</p>
        </div>
      </div>
    </footer>
  );
}
