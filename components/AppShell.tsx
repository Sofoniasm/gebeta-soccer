import Link from "next/link";
import { getMe } from "@/lib/me";
import { formatUnits } from "@/lib/money";
import { signOut } from "@/app/(auth)/actions";
import { Logo } from "./Logo";
import { FlowLines } from "./FlowLines";
import { BottomNav, SideNav } from "./AppNav";
import { LogOutIcon, ShieldIcon, WalletIcon } from "./icons";

/**
 * Logged-in app layout:
 *  - desktop: fixed sidebar (logo, player card, navigation)
 *  - mobile: top bar + bottom tab bar
 */
export async function AppShell({ children, title, next }: { children: React.ReactNode; title?: string; next?: string }) {
  const me = await getMe(next);
  const [units, etb] = formatUnits(me.balance_units).split(" / ");

  return (
    <div className="relative min-h-dvh overflow-x-hidden">
      <FlowLines />

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-white/5 bg-[#0b0912]/90 p-5 backdrop-blur-xl lg:flex">
        <Logo size="sm" href="/dashboard" />
        <Link href="/wallet" className="mt-6 block rounded-3xl border border-lilac/20 bg-gradient-to-br from-lilac/20 to-transparent p-4 hover:border-lilac/40">
          <p className="truncate text-sm font-bold">{me.username}</p>
          <p className="mt-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-lilac"><WalletIcon size={12} /> Wallet</p>
          <p className="text-xl font-extrabold">{units}</p>
          <p className="text-xs text-mist">{etb}</p>
        </Link>
        <div className="mt-6 flex-1">
          <SideNav isAdmin={me.is_admin} />
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
            {me.is_admin && (
              <Link href="/admin" className="rounded-full bg-lilac/15 p-2 text-lilac" aria-label="Admin panel">
                <ShieldIcon size={16} />
              </Link>
            )}
            <Link href="/wallet" className="rounded-full bg-lilac px-3 py-1.5 text-xs font-extrabold text-ink">
              {units}
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

      <BottomNav />
    </div>
  );
}
