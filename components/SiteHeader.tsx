import Link from "next/link";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { SiteNavLinks } from "./SiteNavLinks";

export function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0b0912]/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-6 lg:px-10">
        <Logo size="lg" />
        <SiteNavLinks />
        <div className="flex items-center gap-2">
          {loggedIn ? (
            <Link href="/dashboard" className="hidden rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft sm:inline-flex">
              My predictions
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-full border border-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 sm:inline-flex">
                Log in
              </Link>
              <Link href="/register" className="hidden rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft sm:inline-flex">
                Join
              </Link>
            </>
          )}
          <MobileMenu loggedIn={loggedIn} />
        </div>
      </nav>
    </header>
  );
}
