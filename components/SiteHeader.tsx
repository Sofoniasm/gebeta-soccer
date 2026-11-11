import Link from "next/link";
import { Logo } from "./Logo";

export function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0b0912]/80 backdrop-blur-xl">
      <nav className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:px-10">
        <Logo size="lg" />
        <div className="hidden items-center gap-8 text-xs font-bold uppercase tracking-widest text-mist md:flex">
          <Link href="/#how" className="hover:text-white">How it works</Link>
          <Link href="/#prize" className="hover:text-white">Prize pool</Link>
          <Link href="/#scoring" className="hover:text-white">Scoring</Link>
        </div>
        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Link href="/dashboard" className="rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
              My predictions
            </Link>
          ) : (
            <>
              <Link href="/login" className="rounded-full border border-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">
                Log in
              </Link>
              <Link href="/register" className="hidden rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft sm:inline-flex">
                Join
              </Link>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
