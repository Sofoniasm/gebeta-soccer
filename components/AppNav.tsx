"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BallIcon, ShieldIcon, TrophyIcon, UsersIcon, WalletIcon, ClockIcon } from "./icons";

const ITEMS = [
  { href: "/dashboard", label: "Predict", icon: BallIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
  { href: "/results", label: "Results", icon: ClockIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/profile", label: "Profile", icon: UsersIcon },
];

export function SideNav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-mist/60">Play</p>
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = path === href || path.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
              active ? "bg-lilac text-ink shadow-lg shadow-lilac/20" : "text-mist hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={18} /> {label}
          </Link>
        );
      })}
      {isAdmin && (
        <>
          <p className="px-3 pb-2 pt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-mist/60">Manage</p>
          <Link
            href="/admin"
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-mist transition hover:bg-white/5 hover:text-white"
          >
            <ShieldIcon size={18} /> Admin panel
          </Link>
          <Link
            href="/admin/deposits"
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
              path.startsWith("/admin/deposits") ? "bg-lilac text-ink shadow-lg shadow-lilac/20" : "text-mist hover:bg-white/5 hover:text-white"
            }`}
          >
            <WalletIcon size={18} /> Deposits
          </Link>
        </>
      )}
    </nav>
  );
}

export function BottomNav() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0912]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = path === href || path.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wide ${
                active ? "text-lilac" : "text-mist/70"
              }`}
            >
              <span className={`flex h-8 w-12 items-center justify-center rounded-full transition ${active ? "bg-lilac/15" : ""}`}>
                <Icon size={20} />
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
