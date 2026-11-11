import Link from "next/link";
import { getMe } from "@/lib/me";
import { getCareer, certificatesFor } from "@/lib/career";
import { etbLabel } from "@/lib/money";
import { AppShell } from "@/components/AppShell";
import { AwardIcon, CalendarIcon, ClockIcon, UsersIcon } from "@/components/icons";

export const metadata = { title: "Career · GebetaSoccer" };
export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export default async function CareerPage() {
  const me = await getMe("/career");
  const career = await getCareer(me.id);
  const t = career.totals;
  const certs = certificatesFor(career);
  const earned = certs.filter((c) => c.earned);
  const chartRounds = [...career.rounds].reverse().slice(-12);
  const maxPts = Math.max(...chartRounds.map((r) => r.points), 1);

  const stats = [
    { label: "Rounds played", value: t.roundsPlayed.toLocaleString("en-US") },
    { label: "Total points", value: t.points.toLocaleString("en-US") },
    { label: "Avg per round", value: t.avgPoints.toLocaleString("en-US") },
    { label: "Exact scores", value: t.exact.toLocaleString("en-US") },
    { label: "Correct results", value: `${t.accuracy}%`, sub: `${t.correct} of ${t.graded}` },
    { label: "Best finish", value: t.bestRank ? `#${t.bestRank.rank}` : "—", sub: t.bestRank ? `of ${t.bestRank.players} · ${t.bestRank.round}` : "No settled round yet" },
    { label: "Prizes won", value: t.wins.toLocaleString("en-US"), sub: `${t.podiums} podium${t.podiums === 1 ? "" : "s"}` },
    { label: "Winnings", value: etbLabel(t.winningsUnits) },
  ];

  return (
    <AppShell next="/career">
      {/* Player card */}
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-br from-[#3a3166] via-card to-ink p-6">
        <div className="animate-glow pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lilac/25 blur-3xl" />
        <div className="relative flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-lilac text-2xl font-extrabold text-ink">
            {me.username.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Career</p>
            <h1 className="truncate text-3xl font-extrabold tracking-tight">{me.username}</h1>
            <p className="text-sm text-mist">
              Playing since {fmtDate(me.created_at)} · <b className="text-white">{t.caps}</b> caps (picks made)
            </p>
          </div>
          <Link href="/certificates" className="flex items-center gap-2 rounded-full border border-lilac/40 bg-lilac/10 px-4 py-2 text-xs font-bold uppercase tracking-wider text-lilac-soft hover:bg-lilac/20">
            <AwardIcon size={16} /> {earned.length}/{certs.length} certificates
          </Link>
        </div>
        {earned.length > 0 && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            {earned.slice(0, 8).map((c) => (
              <span key={c.id} title={`${c.name}: ${c.how}`} className="rounded-full bg-white/10 px-3 py-1 text-sm">
                {c.emoji} <span className="text-xs font-bold">{c.name}</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-3xl border border-white/5 bg-card/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-lilac">{s.label}</p>
            <p className="mt-1 text-2xl font-extrabold">{s.value}</p>
            {s.sub && <p className="truncate text-xs text-mist">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,20rem)]">
        {/* History */}
        <section className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
          <h2 className="mb-4 text-lg font-extrabold">Round history</h2>
          {career.rounds.length === 0 ? (
            <p className="py-6 text-center text-sm text-mist">
              No rounds yet. <Link href="/dashboard" className="font-bold text-lilac">Join this week&apos;s round →</Link>
            </p>
          ) : (
            <>
              {chartRounds.length > 1 && (
                <div className="mb-5 flex h-28 items-end gap-1.5">
                  {chartRounds.map((r) => (
                    <div key={r.round_id} className="group flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${r.round_name}: ${r.points} pts`}>
                      <span className="text-[10px] font-bold text-lilac-soft opacity-0 group-hover:opacity-100">{r.points}</span>
                      <div className="w-full rounded-t-md bg-gradient-to-t from-[#6c5fb3] to-lilac" style={{ height: `${Math.max(4, (r.points / maxPts) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-mist/70">
                      <th className="py-3 pr-3">Round</th>
                      <th className="py-3 pr-3 text-right">Rank</th>
                      <th className="py-3 pr-3 text-right">Points</th>
                      <th className="py-3 pr-3 text-right">Exact</th>
                      <th className="py-3 pr-3 text-right">Correct</th>
                      <th className="py-3 text-right">Won</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {career.rounds.map((r) => (
                      <tr key={r.round_id}>
                        <td className="py-3 pr-3">
                          <p className="font-bold">{r.round_name}</p>
                          <p className="text-xs text-mist">{r.status === "settled" ? fmtDate(r.played_at) : "In progress"}</p>
                        </td>
                        <td className="py-3 pr-3 text-right font-bold">
                          {r.rank ? `#${r.rank}` : "—"}
                          <span className="text-xs font-normal text-mist">/{r.players}</span>
                        </td>
                        <td className="py-3 pr-3 text-right font-extrabold text-lilac-soft">
                          {r.points}
                          {r.slam_points > 0 && <span className="ml-1 text-[10px] text-amber-200">+{r.slam_points} slam</span>}
                        </td>
                        <td className="py-3 pr-3 text-right">{r.exact_scores}</td>
                        <td className="py-3 pr-3 text-right">{r.correct_results}</td>
                        <td className={`py-3 text-right font-bold ${r.winnings_units > 0 ? "text-emerald-200" : "text-mist/60"}`}>
                          {r.winnings_units > 0 ? `+${etbLabel(r.winnings_units)}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* Shortcuts (the "Me" hub on mobile) */}
        <section className="space-y-2">
          {[
            { href: "/certificates", label: "Certificates", sub: `${earned.length} earned`, icon: AwardIcon },
            { href: "/results", label: "Round results", sub: "Past rounds and winners", icon: ClockIcon },
            { href: "/fixtures", label: "Fixtures", sub: "All upcoming matches", icon: CalendarIcon },
            { href: "/profile", label: "Profile & settings", sub: "Name, password, phone", icon: UsersIcon },
          ].map(({ href, label, sub, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card/60 p-4 hover:border-lilac/40">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lilac/15 text-lilac">
                <Icon size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold">{label}</span>
                <span className="block truncate text-xs text-mist">{sub}</span>
              </span>
              <span className="text-mist">→</span>
            </Link>
          ))}
        </section>
      </div>
    </AppShell>
  );
}
