import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { etbLabel } from "@/lib/money";
import { RoyaleLobby } from "./RoyaleLobby";

export const metadata = { title: "Quiz Royale · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface MyRoom {
  code: string;
  status: string;
  stake_units: number;
  players: number;
  max_players: number;
  creator: string;
  my_rank: number | null;
  my_payout: number | null;
}

const STATUS: Record<string, [string, string]> = {
  open: ["Waiting for players", "bg-lilac/20 text-lilac-soft"],
  live: ["Live", "bg-rose-400/15 text-rose-200"],
  settled: ["Finished", "bg-white/10 text-mist"],
  refunded: ["Refunded", "bg-white/10 text-mist"],
  cancelled: ["Cancelled", "bg-white/10 text-mist"],
};

export default async function RoyalePage() {
  const me = await getMe("/royale");
  const supabase = await createClient();
  const { data } = await supabase.rpc("royale_my_rooms");
  const rooms = ((data ?? []) as MyRoom[]).map((r) => ({ ...r, stake_units: Number(r.stake_units), players: Number(r.players), my_payout: r.my_payout === null ? null : Number(r.my_payout) }));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

  return (
    <AppShell title="Quiz Royale" next="/royale">
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-6">
        <div className="animate-glow pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-lilac/30 blur-3xl" />
        <h2 className="relative text-xl font-extrabold sm:text-2xl">🧠 Quiz Royale</h2>
        <p className="relative mt-2 max-w-xl text-sm text-mist">
          3 to 6 friends, 10 questions, 15 seconds each. Right answers score 100 points, plus up to 100 more for being fast. The highest score wins their entry back + 90% of
          everyone else&apos;s entries. Football, Ethiopia and general knowledge.
        </p>
      </section>

      <section className={`${card} mb-5`}>
        <h2 className="mb-4 text-lg font-extrabold">New game</h2>
        {me.phone_verified_at ? (
          <RoyaleLobby balanceEtb={Math.round(me.balance_units * 200)} />
        ) : (
          <p className="text-sm text-mist">Confirm your phone number first. <Link href="/profile" className="font-bold text-lilac">Go to Profile</Link></p>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">My games</h2>
        {rooms.length === 0 ? (
          <p className="text-sm text-mist">No games yet. Make a room and send the link to your friends.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {rooms.map((r) => {
              const [label, cls] = STATUS[r.status] ?? [r.status, "bg-white/10 text-mist"];
              return (
                <li key={r.code}>
                  <Link href={`/royale/${r.code}`} className="flex items-center gap-3 py-3 hover:opacity-90">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{label}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{r.code}</span>
                      </div>
                      <p className="mt-1 text-sm font-bold">Entry {etbLabel(r.stake_units)} · by {r.creator}</p>
                      <p className="text-xs text-mist">{r.players}/{r.max_players} players</p>
                    </div>
                    <div className="shrink-0 text-right">
                      {r.my_payout && r.my_payout > 0 ? (
                        <p className="text-sm font-extrabold text-emerald-200">+{etbLabel(r.my_payout)}</p>
                      ) : r.my_rank ? (
                        <p className="text-sm font-extrabold">#{r.my_rank}</p>
                      ) : null}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </AppShell>
  );
}
