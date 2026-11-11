import Link from "next/link";
import { getMe, getUnreadCount } from "@/lib/me";
import { getTodo } from "@/lib/todo";
import { etbLabel, unitsLabel } from "@/lib/money";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "./Logo";
import { Avatar } from "./Avatar";
import { FlowLines } from "./FlowLines";
import { BottomNav, SideNav } from "./AppNav";
import { BellIcon, LogOutIcon, ShieldIcon, WalletIcon } from "./icons";

/**
 * Logged-in app layout:
 *  - desktop: fixed sidebar (logo, player card, navigation)
 *  - mobile: top bar + bottom tab bar
 */
export async function AppShell({ children, title, next }: { children: React.ReactNode; title?: string; next?: string }) {
  const me = await getMe(next);
  const [unread, todo] = await Promise.all([getUnreadCount(), getTodo()]);
  const units = unitsLabel(me.balance_units);
  const etb = etbLabel(me.balance_units);

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stadium.webp" alt="" className="h-full w-full object-cover opacity-[0.14]" />
        <div className="absolute inset-0 bg-gradient-to-b from-plum/40 via-plum/80 to-plum" />
      </div>
      <FlowLines />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/5 bg-[#0b0912]/90 p-5 backdrop-blur-xl lg:flex">
        <div className="flex items-center justify-between">
          <Logo size="sm" href="/dashboard" />
          <Bell unread={unread} />
        </div>
        <Link href="/wallet" className="mt-6 block rounded-3xl border border-lilac/20 bg-gradient-to-br from-lilac/20 to-transparent p-4 hover:border-lilac/40">
          <p className="flex items-center gap-2 truncate text-sm font-bold"><Avatar name={me.username} src={me.avatar_url} size={28} /> <span className="truncate">{me.username}</span></p>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-lilac"><WalletIcon size={12} /> Wallet</p>
          <p className="text-xl font-extrabold">{units}</p>
          <p className="text-xs text-mist">{etb}</p>
        </Link>
        <div className="mt-6 flex-1 overflow-y-auto">
          <SideNav isAdmin={me.is_admin} todoCount={todo.count} />
        </div>
        <form action={signOut}>
          <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold text-mist hover:bg-white/5 hover:text-white">
            <LogOutIcon size={18} /> Sign out
          </button>
        </form>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#0b0912]/85 backdrop-blur-xl lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Logo size="sm" href="/dashboard" />
          <div className="flex items-center gap-2">
            <Bell unread={unread} />
            {me.is_admin && (
              <Link href="/admin" className="rounded-full bg-lilac/15 p-2 text-lilac" aria-label="Admin panel">
                <ShieldIcon size={16} />
              </Link>
            )}
            <Link href="/wallet" className="rounded-full bg-lilac px-3 py-1.5 text-xs font-extrabold text-ink">
              {units}
            </Link>
            <Link href="/profile" aria-label="Profile">
              <Avatar name={me.username} src={me.avatar_url} size={32} />
            </Link>
          </div>
        </div>
      </header>

      <main className="relative px-4 pb-32 pt-5 sm:px-6 lg:ml-72 lg:px-10 lg:pb-16 lg:pt-10">
        <div className="mx-auto max-w-5xl">
          {title && <h1 className="mb-6 text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>}
          {children}
        </div>
      </main>

      <BottomNav todoCount={todo.count} />
    </div>
  );
}

function Bell({ unread }: { unread: number }) {
  return (
    <Link
      href="/notifications"
      className="relative rounded-full bg-white/5 p-2 text-mist transition hover:bg-white/10 hover:text-white"
      aria-label={unread ? `Notifications (${unread} new)` : "Notifications"}
    >
      <BellIcon size={18} />
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white ring-2 ring-[#0b0912]">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
