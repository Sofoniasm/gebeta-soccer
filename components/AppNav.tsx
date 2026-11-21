"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/actions";
import { LiveBalance } from "./LiveBalance";
import {
  AwardIcon,
  BallIcon,
  CalendarIcon,
  ChartIcon,
  ClockIcon,
  FlagIcon,
  ListCheckIcon,
  NewsIcon,
  VersusIcon,
  ShieldIcon,
  StarIcon,
  SettingsIcon,
  TrophyIcon,
  UsersIcon,
  WalletIcon,
  SendIcon,
  MenuIcon,
  XIcon,
  LogOutIcon,
} from "./icons";

type Item = { href: string; label: string; icon: (p: { size?: number }) => React.ReactNode; badge?: "todo"; also?: string[] };

const PLAY: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: BallIcon },
  { href: "/todo", label: "To-do", icon: ListCheckIcon, badge: "todo" },
  { href: "/challenges", label: "Challenges", icon: VersusIcon },
  { href: "/leagues", label: "Leagues", icon: FlagIcon },
  { href: "/fixtures", label: "Fixtures", icon: CalendarIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
  { href: "/games", label: "Games", icon: StarIcon, also: ["/quiz", "/royale", "/survivor", "/gebeta", "/dama", "/chess"] },
  { href: "/results", label: "Results", icon: ClockIcon },
  { href: "/news", label: "News", icon: NewsIcon },
];

const ME: Item[] = [
  { href: "/career", label: "Career", icon: ChartIcon },
  { href: "/certificates", label: "Certificates", icon: AwardIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/sales", label: "Invite friends", icon: UsersIcon },
  { href: "/premium", label: "Premium", icon: StarIcon },
  { href: "/profile", label: "Profile", icon: UsersIcon },
  { href: "/help", label: "Help", icon: SendIcon },
];

const ADMIN_ITEMS: Item[] = [
  { href: "/admin/overview", label: "Overview", icon: ChartIcon },
  { href: "/admin", label: "Rounds", icon: ShieldIcon },
  { href: "/admin/players", label: "Players", icon: UsersIcon },
  { href: "/admin/leagues", label: "Leagues", icon: FlagIcon },
  { href: "/admin/deposits", label: "Deposits", icon: WalletIcon },
  { href: "/admin/subscriptions", label: "Premium", icon: StarIcon },
  { href: "/admin/support", label: "Support", icon: SendIcon },
  { href: "/admin/fraud", label: "Fraud Watch", icon: ShieldIcon },
  { href: "/admin/challenges", label: "Challenges", icon: VersusIcon },
  { href: "/admin/previews", label: "Previews", icon: StarIcon },
  { href: "/admin/quiz", label: "Quiz", icon: ListCheckIcon },
  { href: "/admin/royale", label: "Royale", icon: ListCheckIcon },
  { href: "/admin/chessbot", label: "Chess bot", icon: ShieldIcon },
  { href: "/admin/news", label: "News", icon: NewsIcon },
  { href: "/admin/site", label: "Site", icon: SettingsIcon },
];

/**
 * Phone / Telegram Mini App bottom bar: the main places to PLAY, plus "Menu",
 * which opens every other page (nothing is desktop-only any more).
 */
const BOTTOM: Item[] = [
  { href: "/dashboard", label: "Predict", icon: BallIcon },
  { href: "/challenges", label: "Challenge", icon: VersusIcon },
  { href: "/leagues", label: "Leagues", icon: FlagIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
];

/** Small vibration inside Telegram (does nothing in a normal browser). */
function tap() {
  try {
    (window as unknown as { Telegram?: { WebApp?: { HapticFeedback?: { selectionChanged?: () => void } } } }).Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
  } catch {
    /* not in Telegram */
  }
}

const matches = (path: string, href: string) => (href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`));
const isActive = (path: string, href: string, also: string[] = []) => matches(path, href) || also.some((h) => matches(path, h));

function Badge({ n, className = "" }: { n: number; className?: string }) {
  if (n <= 0) return null;
  return (
    <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white ${className}`}>
      {n > 9 ? "9+" : n}
    </span>
  );
}

function Group({ title, items, path, todo }: { title: string; items: Item[]; path: string; todo: number }) {
  return (
    <>
      <p className="px-3 pb-2 pt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-mist/60 first:pt-0">{title}</p>
      {items.map(({ href, label, icon: Icon, badge, also }) => {
        const active = isActive(path, href, also);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
              active ? "bg-lilac text-ink shadow-lg shadow-lilac/20" : "text-mist hover:bg-white/5 hover:text-white"
            }`}
          >
            <Icon size={18} /> <span className="flex-1">{label}</span>
            {badge === "todo" && <Badge n={todo} />}
          </Link>
        );
      })}
    </>
  );
}

const ADMIN_SALES_ITEM: Item = { href: "/admin/sales", label: "Sales & Referrals", icon: UsersIcon };

export function SideNav({ isAdmin, todoCount = 0 }: { isAdmin: boolean; todoCount?: number }) {
  const path = usePathname();
  const admin = [...ADMIN_ITEMS.slice(0, 3), ADMIN_SALES_ITEM, ...ADMIN_ITEMS.slice(3)];
  return (
    <nav className="space-y-1">
      <Group title="Play" items={PLAY} path={path} todo={todoCount} />
      <Group title="My game" items={ME} path={path} todo={todoCount} />
      {isAdmin && <Group title="Manage" items={admin} path={path} todo={todoCount} />}
    </nav>
  );
}

export function BottomNav({ todoCount = 0, isAdmin = false, username = "", balanceUnits = 0 }: { todoCount?: number; isAdmin?: boolean; username?: string; balanceUnits?: number }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]); // close the menu after moving to a page
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);
  const inBar = BOTTOM.some((b) => isActive(path, b.href));
  const item = (active: boolean) =>
    `flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wide ${active ? "text-lilac" : "text-mist/70"}`;
  const pill = (active: boolean) => `relative flex h-8 w-12 items-center justify-center rounded-full transition ${active ? "bg-lilac/15" : ""}`;

  return (
    <>
      {open && <MenuSheet path={path} todoCount={todoCount} isAdmin={isAdmin} username={username} balanceUnits={balanceUnits} onClose={() => setOpen(false)} />}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0912]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {BOTTOM.map(({ href, label, icon: Icon }) => {
            const active = !open && isActive(path, href);
            return (
              <Link key={href} href={href} onClick={tap} className={item(active)} aria-current={active ? "page" : undefined}>
                <span className={pill(active)}>
                  <Icon size={20} />
                </span>
                {label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              tap();
              setOpen((v) => !v);
            }}
            aria-expanded={open}
            aria-label={open ? "Close menu" : "Open menu: all pages"}
            className={item(open || !inBar)}
          >
            <span className={pill(open || !inBar)}>
              {open ? <XIcon size={20} /> : <MenuIcon size={20} />}
              {!open && todoCount > 0 && <Badge n={todoCount} className="absolute -right-0.5 -top-1" />}
            </span>
            Menu
          </button>
        </div>
      </nav>
    </>
  );
}

/** Full-screen list of every page, grouped like the desktop sidebar, as big tiles. */
function MenuSheet({ path, todoCount, isAdmin, username, balanceUnits, onClose }: { path: string; todoCount: number; isAdmin: boolean; username: string; balanceUnits: number; onClose: () => void }) {
  const groups: { title: string; items: Item[] }[] = [
    { title: "Play", items: [...PLAY.filter((i) => !BOTTOM.some((b) => b.href === i.href)), { href: "/challenges/new", label: "New challenge", icon: VersusIcon }] },
    { title: "My game", items: ME.filter((i) => !BOTTOM.some((b) => b.href === i.href)) },
    ...(isAdmin ? [{ title: "Manage", items: [{ href: "/admin", label: "Admin panel", icon: ShieldIcon }] }] : []),
  ];
  return (
    <div className="fixed inset-0 z-[39] overflow-y-auto bg-[#0b0912]/97 px-4 pb-32 pt-4 backdrop-blur-xl lg:hidden" role="dialog" aria-modal="true" aria-label="All pages">
      <div className="mx-auto max-w-lg">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-lg font-extrabold">Menu</p>
          <form action={signOut} className="ml-auto mr-2">
            <button className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-mist hover:text-white">
              <LogOutIcon size={14} /> Log out
            </button>
          </form>
          <button type="button" onClick={onClose} className="rounded-full bg-white/5 p-2 text-mist hover:text-white" aria-label="Close menu">
            <XIcon size={18} />
          </button>
        </div>
        {username && (
          <Link href="/wallet" onClick={tap} className="mt-2 flex items-center justify-between gap-3 rounded-2xl border border-lilac/25 bg-gradient-to-br from-lilac/20 to-transparent p-4">
            <span className="min-w-0">
              <span className="block truncate text-base font-extrabold">{username}</span>
              <span className="block text-xs text-mist">Wallet balance</span>
            </span>
            <span className="shrink-0 text-right text-sm font-extrabold text-white"><LiveBalance initialUnits={balanceUnits} show="both" /></span>
          </Link>
        )}
        {groups.map((g) => (
          <section key={g.title} className="mt-4">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.2em] text-mist/60">{g.title}</p>
            <div className="grid grid-cols-3 gap-2">
              {g.items.map(({ href, label, icon: Icon, badge, also }) => {
                const active = isActive(path, href, also);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={tap}
                    className={`relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center text-xs font-bold transition ${
                      active ? "border-lilac bg-lilac/20 text-white" : "border-white/5 bg-card/70 text-mist hover:border-lilac/40 hover:text-white"
                    }`}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lilac/15 text-lilac">
                      <Icon size={20} />
                    </span>
                    {label}
                    {badge === "todo" && <Badge n={todoCount} className="absolute right-2 top-2" />}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
        <form action={signOut} className="mt-6">
          <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 py-3 text-sm font-semibold text-mist hover:bg-white/5 hover:text-white">
            <LogOutIcon size={16} /> Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
