import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { getOverview } from "@/lib/admin-stats";
import { etbLabel, unitsLabel } from "@/lib/money";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Overview · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const TZ = "Africa/Addis_Ababa";
const when = (iso: string) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} h ago`;
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
};
const TONE: Record<string, string> = {
  plus: "text-emerald-200",
  minus: "text-rose-200",
  warn: "text-amber-100",
  info: "text-mist",
};

export default async function OverviewPage() {
  await requireAdminId("/admin/overview");
  const { players, money, game, days, activity, newest } = await getOverview();
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
  const maxSignups = Math.max(...days.map((d) => d.signups), 1);
  const maxDeposits = Math.max(...days.map((d) => d.deposits), 1);

  const tiles: { label: string; value: string; sub?: string; href?: string; alert?: boolean }[] = [
    { label: "Registered players", value: players.total.toLocaleString("en-US"), sub: `+${players.today} today · +${players.week} this week`, href: "/admin/players" },
    { label: "Phone confirmed", value: players.verified.toLocaleString("en-US"), sub: `${players.total - players.verified} not confirmed yet`, href: "/admin/players" },
    { label: "Active (30 days)", value: players.active30.toLocaleString("en-US"), sub: `${players.withBalance} with money in wallet` },
    { label: "Deposits received", value: etbLabel(money.deposited), sub: `${etbLabel(money.depositedToday)} today · ${etbLabel(money.depositedWeek)} this week`, href: "/admin/deposits" },
    { label: "House revenue (30%)", value: etbLabel(money.houseRevenue), sub: `Rounds ${etbLabel(money.houseFromRounds)} · Leagues ${etbLabel(money.houseFromLeagues)}` },
    { label: "Prizes paid", value: etbLabel(money.prizesPaid), sub: `${game.roundsSettled} round${game.roundsSettled === 1 ? "" : "s"} settled` },
    { label: "In players' wallets", value: etbLabel(money.heldInWallets), sub: `${etbLabel(money.inPlay)} in open rounds/leagues` },
    {
      label: "Withdrawals",
      value: money.pendingWithdrawals ? `${money.pendingWithdrawals} waiting` : "None waiting",
      sub: `${etbLabel(money.pendingWithdrawUnits)} to send · ${etbLabel(money.withdrawnPaid)} paid so far`,
      href: "/admin/players",
      alert: money.pendingWithdrawals > 0,
    },
    {
      label: "League requests",
      value: game.leagueRequests ? `${game.leagueRequests} waiting` : "None waiting",
      sub: `${game.leagues} league${game.leagues === 1 ? "" : "s"} · ${game.roundsOpen} open round${game.roundsOpen === 1 ? "" : "s"}`,
      href: "/admin/leagues",
      alert: game.leagueRequests > 0,
    },
    { label: "Predictions made", value: game.predictions.toLocaleString("en-US") },
  ];

  return (
    <AppShell title="Overview" next="/admin/overview">
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const inner = (
            <div
              className={`h-full rounded-3xl border p-4 transition ${
                t.alert ? "border-amber-200/40 bg-amber-200/10" : "border-white/5 bg-card/60"
              } ${t.href ? "hover:border-lilac/40" : ""}`}
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-lilac">{t.label}</p>
              <p className="mt-1 text-xl font-extrabold sm:text-2xl">{t.value}</p>
              {t.sub && <p className="mt-0.5 text-xs text-mist">{t.sub}</p>}
            </div>
          );
          return t.href ? (
            <Link key={t.label} href={t.href}>
              {inner}
            </Link>
          ) : (
            <div key={t.label}>{inner}</div>
          );
        })}
      </div>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        {[
          { title: "New players · last 30 days", key: "signups" as const, max: maxSignups, fmt: (n: number) => `${n}` },
          { title: "Deposits · last 30 days", key: "deposits" as const, max: maxDeposits, fmt: (n: number) => etbLabel(n) },
        ].map((c) => (
          <section key={c.title} className={card}>
            <h2 className="mb-4 text-lg font-extrabold">{c.title}</h2>
            <div className="flex h-40 items-end gap-1">
              {days.map((d) => {
                const v = d[c.key];
                return (
                  <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${d.key}: ${c.fmt(v)}`}>
                    <span className="text-[9px] font-bold text-lilac-soft opacity-0 group-hover:opacity-100">{v > 0 ? c.fmt(v).replace(" ETB", "") : ""}</span>
                    <div
                      className={`w-full rounded-t ${v > 0 ? "bg-gradient-to-t from-[#6c5fb3] to-lilac" : "bg-white/10"}`}
                      style={{ height: `${v > 0 ? Math.max(6, (v / c.max) * 100) : 2}%` }}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-mist">
              <span>{days[0].label}</span>
              <span>{days[14].label}</span>
              <span>today</span>
            </div>
          </section>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <section className={card}>
          <h2 className="mb-4 text-lg font-extrabold">Live activity</h2>
          {activity.length === 0 ? (
            <p className="py-6 text-center text-sm text-mist">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {activity.map((a, i) => (
                <li key={`${a.at}-${i}`} className="flex items-start gap-3 py-2.5 text-sm">
                  <span className="w-6 text-center">{a.icon}</span>
                  <span className="min-w-0 flex-1">
                    {a.userId ? (
                      <Link href={`/admin/players/${a.userId}`} className="font-bold hover:text-lilac">
                        {a.username}
                      </Link>
                    ) : (
                      <b>{a.username}</b>
                    )}{" "}
                    <span className={TONE[a.tone]}>{a.text}</span>
                  </span>
                  <span className="shrink-0 text-xs text-mist">{when(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold">Newest players</h2>
            <Link href="/admin/players" className="text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
              All →
            </Link>
          </div>
          <ul className="space-y-2">
            {newest.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/players/${p.id}`} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-ink/40 p-3 hover:border-lilac/40">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-lilac/15 font-extrabold text-lilac">
                    {p.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">
                      {p.username}
                      {!p.phone_verified_at && <span className="ml-1 text-[9px] font-bold uppercase text-amber-100">unverified</span>}
                    </span>
                    <span className="block truncate text-xs text-mist">
                      {p.phone_number ?? "no phone"} · {when(p.created_at)}
                    </span>
                  </span>
                  <span className="text-xs font-bold text-lilac-soft">{unitsLabel(p.balance_units)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
