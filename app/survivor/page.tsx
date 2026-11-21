import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { etbLabel } from "@/lib/money";
import { survivorStatusLabel } from "@/lib/survivor";
import { SurvivorLobby } from "./SurvivorLobby";

export const metadata = { title: "Survivor pools · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface MyPool {
  code: string;
  status: string;
  stake_units: number;
  players: number;
  alive: number;
  creator: string;
  my_alive: boolean;
  my_payout: number | null;
}

const STATUS_CLASS: Record<string, string> = {
  open: "bg-lilac/20 text-lilac-soft",
  live: "bg-rose-400/15 text-rose-200",
};

export default async function SurvivorPage() {
  const me = await getMe("/survivor");
  const supabase = await createClient();
  const { data } = await supabase.rpc("survivor_my_pools");
  const pools = ((data ?? []) as MyPool[]).map((r) => ({ ...r, stake_units: Number(r.stake_units), players: Number(r.players), alive: Number(r.alive), my_payout: r.my_payout === null ? null : Number(r.my_payout) }));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

  return (
    <AppShell title="Survivor pools" next="/survivor">
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-6">
        <div className="animate-glow pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-lilac/30 blur-3xl" />
        <h2 className="relative text-xl font-extrabold sm:text-2xl">🛡️ Survivor pools</h2>
        <p className="relative mt-2 max-w-xl text-sm text-mist">
          3 to 20 friends. Every match day, pick ONE team you think will win. If it wins you survive; if it draws or loses you&apos;re out. You can&apos;t use the same team twice.
          The last one standing wins their entry back + 90% of everyone else&apos;s entries.
        </p>
      </section>

      <section className={`${card} mb-5`}>
        <h2 className="mb-4 text-lg font-extrabold">New pool</h2>
        {me.phone_verified_at ? (
          <SurvivorLobby balanceEtb={Math.round(me.balance_units * 200)} />
        ) : (
          <p className="text-sm text-mist">Confirm your phone number first. <Link href="/profile" className="font-bold text-lilac">Go to Profile</Link></p>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">My pools</h2>
        {pools.length === 0 ? (
          <p className="text-sm text-mist">No pools yet. Make one and send the link to your friends.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {pools.map((r) => (
              <li key={r.code}>
                <Link href={`/survivor/${r.code}`} className="flex items-center gap-3 py-3 hover:opacity-90">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_CLASS[r.status] ?? "bg-white/10 text-mist"}`}>{survivorStatusLabel(r.status)}</span>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{r.code}</span>
                    </div>
                    <p className="mt-1 text-sm font-bold">Entry {etbLabel(r.stake_units)} · by {r.creator}</p>
                    <p className="text-xs text-mist">{r.status === "live" ? `${r.alive} of ${r.players} still alive` : `${r.players} players`}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    {r.my_payout && r.my_payout > 0 ? (
                      <p className="text-sm font-extrabold text-emerald-200">+{etbLabel(r.my_payout)}</p>
                    ) : r.status === "live" ? (
                      <p className={`text-sm font-extrabold ${r.my_alive ? "text-emerald-200" : "text-rose-200"}`}>{r.my_alive ? "Alive" : "Out"}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
