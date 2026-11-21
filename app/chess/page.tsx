import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { etbLabel } from "@/lib/money";
import { ChessLobby } from "./ChessLobby";

export const metadata = { title: "Chess 1 vs 1 · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface MyChessGame {
  code: string;
  status: string;
  stake_units: number;
  creator: string;
  opponent: string | null;
  i_won: boolean | null;
  result: string | null;
}

const STATUS: Record<string, [string, string]> = {
  open: ["Waiting for an opponent", "bg-lilac/20 text-lilac-soft"],
  live: ["Playing", "bg-rose-400/15 text-rose-200"],
  settled: ["Finished", "bg-white/10 text-mist"],
  cancelled: ["Cancelled", "bg-white/10 text-mist"],
};

export default async function ChessPage() {
  const me = await getMe("/chess");
  const supabase = await createClient();
  const { data } = await supabase.rpc("chess_my_games");
  const games = ((data ?? []) as MyChessGame[]).map((g) => ({ ...g, stake_units: Number(g.stake_units) }));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

  return (
    <AppShell title="Chess 1 vs 1" next="/chess">
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-6">
        <div className="animate-glow pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-lilac/30 blur-3xl" />
        <h2 className="relative text-xl font-extrabold sm:text-2xl">♞ Chess 1 vs 1</h2>
        <p className="relative mt-2 max-w-xl text-sm text-mist">
          Full chess with real rules: castling, en passant, promotion, check and checkmate, all checked by the server. Colours are drawn at random. Checkmate your opponent to win their stake
          (minus a 10% fee on the winnings). A draw returns both stakes. 2 minutes per move; running out of time loses.
        </p>
      </section>

      <section className={`${card} mb-5`}>
        <h2 className="mb-4 text-lg font-extrabold">New game</h2>
        {me.phone_verified_at ? (
          <ChessLobby balanceEtb={Math.round(me.balance_units * 200)} />
        ) : (
          <p className="text-sm text-mist">Confirm your phone number first. <Link href="/profile" className="font-bold text-lilac">Go to Profile</Link></p>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">My games</h2>
        {games.length === 0 ? (
          <p className="text-sm text-mist">No games yet. Create one and send the link to a friend.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {games.map((g) => {
              const [label, cls] = STATUS[g.status] ?? [g.status, "bg-white/10 text-mist"];
              return (
                <li key={g.code}>
                  <Link href={`/chess/${g.code}`} className="flex items-center gap-3 py-3 hover:opacity-90">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{label}</span>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{g.code}</span>
                      </div>
                      <p className="mt-1 text-sm font-bold">{g.creator} vs {g.opponent ?? "…"}</p>
                      <p className="text-xs text-mist">Stake {etbLabel(g.stake_units)}</p>
                    </div>
                    <div className="shrink-0 text-right text-sm font-extrabold">
                      {g.status === "settled" && (g.result === "draw" ? <span>Draw</span> : g.i_won ? <span className="text-emerald-200">Won</span> : <span className="text-rose-200">Lost</span>)}
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
