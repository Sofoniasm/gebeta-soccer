"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  TrophyIcon,
  UsersIcon,
  WalletIcon,
} from "./icons";

type Item = { href: string; label: string; icon: (p: { size?: number }) => React.ReactNode; badge?: "todo" };

const PLAY: Item[] = [
  { href: "/dashboard", label: "Dashboard", icon: BallIcon },
  { href: "/todo", label: "To-do", icon: ListCheckIcon, badge: "todo" },
  { href: "/challenges", label: "Challenges", icon: VersusIcon },
  { href: "/leagues", label: "Leagues", icon: FlagIcon },
  { href: "/fixtures", label: "Fixtures", icon: CalendarIcon },
  { href: "/leaderboard", label: "Leaderboard", icon: TrophyIcon },
  { href: "/results", label: "Results", icon: ClockIcon },
  { href: "/news", label: "News", icon: NewsIcon },
];

const ME: Item[] = [
  { href: "/career", label: "Career", icon: ChartIcon },
  { href: "/certificates", label: "Certificates", icon: AwardIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/profile", label: "Profile", icon: UsersIcon },
];

const ADMIN_ITEMS: Item[] = [
  { href: "/admin/overview", label: "Overview", icon: ChartIcon },
  { href: "/admin", label: "Rounds", icon: ShieldIcon },
  { href: "/admin/players", label: "Players", icon: UsersIcon },
  { href: "/admin/leagues", label: "Leagues", icon: FlagIcon },
  { href: "/admin/deposits", label: "Deposits", icon: WalletIcon },
  { href: "/admin/challenges", label: "Challenges", icon: VersusIcon },
  { href: "/admin/previews", label: "Previews", icon: StarIcon },
  { href: "/admin/news", label: "News", icon: NewsIcon },
];

/** Mobile bottom bar: the five most used places. "Me" opens Career, which links to the rest. */
const BOTTOM: Item[] = [
  { href: "/dashboard", label: "Predict", icon: BallIcon },
  { href: "/todo", label: "To-do", icon: ListCheckIcon, badge: "todo" },
  { href: "/leaderboard", label: "Table", icon: TrophyIcon },
  { href: "/wallet", label: "Wallet", icon: WalletIcon },
  { href: "/career", label: "Me", icon: ChartIcon },
];

const isActive = (path: string, href: string) =>
  href === "/admin" ? path === "/admin" : path === href || path.startsWith(`${href}/`);

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
      {items.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(path, href);
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

export function SideNav({ isAdmin, todoCount = 0 }: { isAdmin: boolean; todoCount?: number }) {
  const path = usePathname();
  return (
    <nav className="space-y-1">
      <Group title="Play" items={PLAY} path={path} todo={todoCount} />
      <Group title="My game" items={ME} path={path} todo={todoCount} />
      {isAdmin && <Group title="Manage" items={ADMIN_ITEMS} path={path} todo={todoCount} />}
    </nav>
  );
}

export function BottomNav({ todoCount = 0 }: { todoCount?: number }) {
  const path = usePathname();
  const meActive = ["/challenges", "/career", "/certificates", "/profile", "/results", "/fixtures", "/notifications", "/leagues", "/join"].some((p) => path.startsWith(p));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0912]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5">
        {BOTTOM.map(({ href, label, icon: Icon, badge }) => {
          const active = href === "/career" ? meActive : isActive(path, href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold uppercase tracking-wide ${
                active ? "text-lilac" : "text-mist/70"
              }`}
            >
              <span className={`relative flex h-8 w-12 items-center justify-center rounded-full transition ${active ? "bg-lilac/15" : ""}`}>
                <Icon size={20} />
                {badge === "todo" && <Badge n={todoCount} className="absolute -right-0.5 -top-1" />}
              </span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
