import Link from "next/link";
import { Wordmark } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-white/5 bg-ink">
      <div className="mx-auto grid max-w-7xl gap-10 px-6 py-12 lg:px-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Wordmark className="text-2xl" />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-mist">
            Ethiopia&apos;s weekly football prediction game, inspired by Gebeta — the board game of strategy we all grew up with.
          </p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-lilac">Play</p>
          <ul className="mt-4 space-y-2 text-sm text-mist">
            <li><Link href="/register" className="hover:text-white">Create account</Link></li>
            <li><Link href="/login" className="hover:text-white">Log in</Link></li>
            <li><Link href="/dashboard" className="hover:text-white">My predictions</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-lilac">Learn</p>
          <ul className="mt-4 space-y-2 text-sm text-mist">
            <li><Link href="/#how" className="hover:text-white">How it works</Link></li>
            <li><Link href="/#prize" className="hover:text-white">Prize pool</Link></li>
            <li><Link href="/#scoring" className="hover:text-white">Scoring</Link></li>
            <li><Link href="/terms" className="hover:text-white">Terms &amp; responsible play</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-6 py-5 lg:px-10 text-xs text-mist/70 sm:flex-row">
          <p>© {new Date().getFullYear()} GebetaSoccer</p>
          <p>18+ only · Play responsibly — only stake what you can afford to lose.</p>
        </div>
      </div>
    </footer>
  );
}
