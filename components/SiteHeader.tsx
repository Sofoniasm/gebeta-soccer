import Link from "next/link";
import { Logo } from "./Logo";
import { MobileMenu } from "./MobileMenu";
import { SiteNavLinks } from "./SiteNavLinks";
import { LangSwitch } from "./LangSwitch";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import { COMMON } from "@/lib/i18n/common";

export async function SiteHeader({ loggedIn }: { loggedIn: boolean }) {
  const lang = await getLang();
  const t = COMMON[lang];
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0b0912]/85 backdrop-blur-xl">
      <nav className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-10">
        {/* Smaller logo on phones so the Log in button and the menu always fit */}
        <span className="sm:hidden">
          <Logo size="sm" href={localPath("/", lang)} />
        </span>
        <span className="hidden sm:block">
          <Logo size="lg" href={localPath("/", lang)} />
        </span>
        <SiteNavLinks lang={lang} />
        <div className="flex items-center gap-2">
          {/* Very narrow phones: the language switch moves into the ≡ menu */}
          <span className="hidden min-[400px]:block">
            <LangSwitch />
          </span>
          {/* Phones: one clear button next to the menu (the wide buttons below need more room) */}
          <Link
            href={loggedIn ? "/dashboard" : "/login"}
            className="rounded-full bg-lilac px-3.5 py-2 text-[11px] font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft sm:hidden"
          >
            {loggedIn ? t.myPicks : t.logIn}
          </Link>
          {loggedIn ? (
            <Link href="/dashboard" className="hidden rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft sm:inline-flex">
              {t.myPredictions}
            </Link>
          ) : (
            <>
              <Link href="/login" className="hidden rounded-full border border-white/70 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 sm:inline-flex">
                {t.logIn}
              </Link>
              <Link href="/register" className="hidden rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft sm:inline-flex">
                {t.join}
              </Link>
            </>
          )}
          <MobileMenu loggedIn={loggedIn} lang={lang} />
        </div>
      </nav>
    </header>
  );
}
