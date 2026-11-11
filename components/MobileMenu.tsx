"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export const SITE_LINKS = [
  { href: "/tournaments", label: "Tournaments" },
  { href: "/how-to-play", label: "How to play" },
  { href: "/news", label: "News" },
  { href: "/apps", label: "Apps" },
  { href: "/about", label: "About" },
];

export function MobileMenu({ loggedIn }: { loggedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);

  return (
    <div className="lg:hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close menu" : "Open menu"}
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
            {SITE_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`border-b border-white/5 py-4 text-sm font-bold uppercase tracking-widest ${path.startsWith(l.href) ? "text-lilac" : "text-white"}`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 grid grid-cols-2 gap-3">
            {loggedIn ? (
              <Link href="/dashboard" className="col-span-2 rounded-full bg-lilac py-3 text-center text-xs font-bold uppercase tracking-wider text-ink">
                My predictions
              </Link>
            ) : (
              <>
                <Link href="/login" className="rounded-full border border-white/60 py-3 text-center text-xs font-bold uppercase tracking-wider">Log in</Link>
                <Link href="/register" className="rounded-full bg-lilac py-3 text-center text-xs font-bold uppercase tracking-wider text-ink">Join</Link>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
