import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { formatEtb } from "@/lib/format";
import { unitsToEtb } from "@/lib/money";

export const metadata = { title: "Premium · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const day = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

export default async function AdminSubscriptionsPage() {
  await requireAdminId("/admin/subscriptions");
  const admin = createAdminClient();
  const [{ data: subs }, { data: pays }] = await Promise.all([
    admin.from("subscriptions").select("user_id, plan, auto_renew, started_at, current_period_end, profiles(username, phone_number)").order("current_period_end", { ascending: false }),
    admin.from("wallet_ledger").select("user_id, amount_units, reference, created_at").eq("kind", "subscription").order("created_at", { ascending: false }).limit(5000),
  ]);
  type Sub = { user_id: string; plan: string; auto_renew: boolean; started_at: string; current_period_end: string; profiles: { username: string; phone_number: string | null } | null };
  const list = (subs ?? []) as unknown as Sub[];
  const payments = ((pays ?? []) as { user_id: string; amount_units: number; reference: string; created_at: string }[]).map((p) => ({ ...p, units: -Number(p.amount_units) }));
  const now = Date.now();
  const active = list.filter((s) => new Date(s.current_period_end).getTime() > now);
  const ended = list.filter((s) => new Date(s.current_period_end).getTime() <= now);
  const total = payments.reduce((s, p) => s + p.units, 0);
  const last30 = payments.filter((p) => now - new Date(p.created_at).getTime() < 30 * 86_400_000).reduce((s, p) => s + p.units, 0);
  const nameOf = new Map(list.map((s) => [s.user_id, s.profiles?.username ?? "?"]));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  const stats: [string, string][] = [
    ["Active subscribers", String(active.length)],
    ["Monthly / yearly", `${active.filter((s) => s.plan === "monthly").length} / ${active.filter((s) => s.plan === "yearly").length}`],
    ["Revenue, last 30 days", formatEtb(unitsToEtb(last30))],
    ["Revenue, all time", formatEtb(unitsToEtb(total))],
  ];

  return (
    <AppShell title="Gebeta Premium" next="/admin/subscriptions">
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-white/5 bg-card/60 p-4">
            <p className="text-xs text-mist">{k}</p>
            <p className="mt-1 text-xl font-extrabold">{v}</p>
          </div>
        ))}
      </div>

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">Active subscribers</h2>
        {active.length === 0 ? (
          <p className="text-sm text-mist">Nobody yet. Players buy Premium on the Premium page with Units from their wallet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] text-left text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-mist">
                <tr><th className="py-2">Player</th><th>Plan</th><th>Subscribed</th><th>Expires</th><th>Auto-renew</th></tr>
              </thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.user_id} className="border-t border-white/5">
                    <td className="py-2.5"><Link href={`/admin/players/${s.user_id}`} className="font-semibold text-lilac">{s.profiles?.username ?? "?"}</Link></td>
                    <td className="capitalize">{s.plan}</td>
                    <td>{day(s.started_at)}</td>
                    <td className="font-semibold">{day(s.current_period_end)}</td>
                    <td>{s.auto_renew ? "On" : <span className="text-mist">Off (ends)</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Latest payments</h2>
          <ul className="space-y-2 text-sm">
            {payments.slice(0, 30).map((p, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span className="min-w-0 truncate"><b className="text-white">{nameOf.get(p.user_id) ?? "?"}</b> <span className="text-mist">· {p.reference}</span></span>
                <span className="shrink-0 text-emerald-200">{formatEtb(unitsToEtb(p.units))}</span>
              </li>
            ))}
            {payments.length === 0 && <li className="text-mist">None yet.</li>}
          </ul>
        </section>
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Ended</h2>
          <ul className="space-y-2 text-sm">
            {ended.slice(0, 30).map((s) => (
              <li key={s.user_id} className="flex justify-between gap-3">
                <Link href={`/admin/players/${s.user_id}`} className="font-semibold text-lilac">{s.profiles?.username ?? "?"}</Link>
                <span className="text-mist">{s.plan} · ended {day(s.current_period_end)}</span>
              </li>
            ))}
            {ended.length === 0 && <li className="text-mist">None.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
