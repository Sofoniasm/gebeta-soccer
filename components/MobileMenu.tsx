"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { localPath, stripLang, type Lang } from "@/lib/i18n";
import { COMMON, SITE_LINK_KEYS } from "@/lib/i18n/common";

export function MobileMenu({ loggedIn, lang = "en" }: { loggedIn: boolean; lang?: Lang }) {
  const [open, setOpen] = useState(false);
  const fullPath = usePathname() || "/";
  const path = stripLang(fullPath);
  const t = COMMON[lang];
  useEffect(() => setOpen(false), [fullPath]);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? t.closeMenu : t.openMenu}
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 text-white"
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>
      {open && (
        <div className="fixed inset-x-0 top-[72px] z-40 border-b border-white/10 bg-[#0b0912]/97 px-6 pb-6 pt-2 backdrop-blur-xl">
          <nav className="flex flex-col">
            {SITE_LINK_KEYS.map((l) => (
              <Link
                key={l.href}
                href={localPath(l.href, lang)}
                className={`border-b border-white/5 py-4 text-sm font-bold uppercase tracking-widest ${path.startsWith(l.href) ? "text-lilac" : "text-white"}`}
              >
                {t.nav[l.key]}
              </Link>
            ))}
          </nav>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {loggedIn ? (
              <Link href="/dashboard" className="col-span-2 rounded-full bg-lilac py-3 text-center text-xs font-bold uppercase tracking-wider text-ink">
                {t.myPredictions}
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-full border border-white/60 py-3 text-center text-xs font-bold uppercase tracking-wider">{t.logIn}</Link>
                <Link href="/register" className="rounded-full bg-lilac py-3 text-center text-xs font-bold uppercase tracking-wider text-ink">{t.join}</Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
