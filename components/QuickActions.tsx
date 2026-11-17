import Link from "next/link";
import { etbLabel } from "@/lib/money";

/**
 * Top of the Dashboard: a short greeting and big tiles for everything you can
 * do right now, so the first screen on a phone is about playing, not reading.
 */
export function QuickActions({
  username,
  balanceUnits,
  roundOpen,
  picksNeeded,
}: {
  username: string;
  balanceUnits: number;
  roundOpen: boolean;
  /** Slips still to place in the next 24 h (from the To-do list). */
  picksNeeded: number;
}) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", hour: "numeric", hour12: false }).format(new Date()));
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const tiles = [
    { href: roundOpen ? "#slip" : "/fixtures", emoji: "🎯", title: roundOpen ? "Predict" : "Fixtures", sub: roundOpen ? "Today's round" : "Next matches", hot: roundOpen },
    { href: "/challenges/new", emoji: "🤝", title: "Challenge", sub: "Bet a friend" },
    { href: "/leagues", emoji: "🏆", title: "Leagues", sub: "Play your group" },
    { href: "/quiz", emoji: "🧠", title: "Quiz", sub: "Daily questions" },
    { href: "/sales", emoji: "👥", title: "Invite", sub: "Earn commission" },
    { href: "/leaderboard", emoji: "📊", title: "Table", sub: "Who's on top" },
  ];
  return (
    <section className="mb-5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-lilac">{hello}</p>
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{username} 👋</h1>
        </div>
        <Link href="/wallet" className="shrink-0 rounded-2xl border border-lilac/25 bg-lilac/10 px-3 py-2 text-right hover:border-lilac/50">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-lilac">Balance</span>
          <span className="block text-sm font-extrabold">{etbLabel(balanceUnits)}</span>
        </Link>
      </div>
      {picksNeeded > 0 && (
        <Link href="/todo" className="mb-3 flex items-center gap-2 rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-2.5 text-sm font-bold text-rose-100">
          ⏰ {picksNeeded} slip{picksNeeded === 1 ? "" : "s"} to place in the next 24 hours <span className="ml-auto text-xs">Go →</span>
        </Link>
      )}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {tiles.map((t) => (
          <Link
            key={t.title}
            href={t.href}
            className={`flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition active:scale-95 ${
              t.hot ? "border-lilac/50 bg-gradient-to-br from-lilac/30 to-lilac/5" : "border-white/5 bg-card/70 hover:border-lilac/40"
            }`}
          >
            <span className="text-2xl" aria-hidden="true">{t.emoji}</span>
            <span className="text-sm font-extrabold text-white">{t.title}</span>
            <span className="text-[10px] leading-tight text-mist">{t.sub}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
