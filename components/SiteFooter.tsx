import Link from "next/link";
import { Wordmark } from "./Logo";
import { TELEGRAM_URL } from "@/lib/config";

const COLS = [
  { title: "Play", links: [["Create account", "/register"], ["Log in", "/login"], ["My predictions", "/dashboard"], ["Tournaments", "/tournaments"]] },
  { title: "Learn", links: [["How to play", "/how-to-play"], ["News", "/news"], ["Get the app", "/apps"], ["Terms & responsible play", "/terms"]] },
  { title: "Company", links: [["About us", "/about"], ["For businesses", "/business"], ["Contact on Telegram", TELEGRAM_URL]] },
];

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/5 bg-ink">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-14 sm:grid-cols-2 lg:grid-cols-5 lg:px-10">
        <div className="lg:col-span-2">
          <Wordmark className="text-2xl" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist">
            Ethiopia&apos;s weekly football prediction game, inspired by Gebeta — the board game of strategy we all grew up with.
          </p>
          <span className="mt-5 inline-flex rounded-full border border-white/15 px-3 py-1 text-xs font-bold text-mist">18+ · Play responsibly</span>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <p className="text-xs font-bold uppercase tracking-widest text-lilac">{c.title}</p>
            <ul className="mt-4 space-y-2 text-sm text-mist">
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
