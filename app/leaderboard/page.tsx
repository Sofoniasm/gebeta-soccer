import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRound } from "@/lib/rounds";
import { AppShell } from "@/components/AppShell";
import { TrophyIcon } from "@/components/icons";

export const metadata = { title: "Leaderboard · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface Row {
  rank: number;
  username: string;
  points: number;
  exact_scores: number;
  is_me: boolean;
  predicted?: number;
  rounds_played?: number;
  wins?: number;
}

function Medal({ rank }: { rank: number }) {
  const style =
    rank === 1 ? "bg-gradient-to-br from-[#f3e7a3] to-[#c9a74a] text-ink"
    : rank === 2 ? "bg-gradient-to-br from-white to-[#b9b6c8] text-ink"
    : rank === 3 ? "bg-gradient-to-br from-[#e6b48a] to-[#a86b43] text-ink"
    : "bg-white/10 text-mist";
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${style}`}>{rank}</span>;
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab = "round" } = await searchParams;
  const supabase = await createClient();
  const round = await getCurrentRound(supabase);

  let rows: Row[] = [];
  if (tab === "all") {
    const { data } = await supabase.rpc("get_overall_leaderboard", { p_limit: 100 });
    rows = (data ?? []) as Row[];
  } else if (round) {
    const { data } = await supabase.rpc("get_round_leaderboard", { p_round_id: round.id });
    rows = (data ?? []) as Row[];
  }
  const me = rows.find((r) => r.is_me);

  const tabClass = (t: string) =>
    `rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition ${
      tab === t ? "bg-lilac text-ink" : "text-mist hover:bg-white/5 hover:text-white"
    }`;

  return (
    <AppShell title="Leaderboard" next="/leaderboard">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-white/10 bg-ink/60 p-1">
          <Link href="/leaderboard" className={tabClass("round")}>{round ? round.name : "This round"}</Link>
          <Link href="/leaderboard?tab=all" className={tabClass("all")}>All-time</Link>
        </div>
        {me && (
          <p className="rounded-full bg-lilac/15 px-4 py-2 text-sm font-bold text-lilac-soft">
            You: #{me.rank} · {Number(me.points)} pts
          </p>
        )}
      </div>

      {tab !== "all" && round && round.status !== "settled" && (
        <p className="mb-4 text-xs text-mist">Live — points update as matches finish. Ties are split by most exact scores.</p>
      )}

      {rows.length === 0 ? (
        <div className="rounded-[2rem] border border-white/5 bg-card/60 p-10 text-center">
          <TrophyIcon size={32} className="mx-auto text-lilac" />
          <p className="mt-3 font-bold">No players yet</p>
          <p className="mt-1 text-sm text-mist">{tab === "all" ? "The all-time table fills up after the first round is settled." : "Be the first to join this round."}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-[2rem] border border-white/5 bg-card/60">
          <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-white/5 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.2em] text-mist/70">
            <span>Rank</span>
            <span>Player</span>
            <span className="text-right">Points</span>
          </div>
          {rows.map((r, i) => (
            <div
              key={`${r.username}-${i}`}
              className={`grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-white/5 px-5 py-3 last:border-0 ${
                r.is_me ? "bg-lilac/10" : ""
              }`}
            >
              <Medal rank={Number(r.rank)} />
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {r.username} {r.is_me && <span className="ml-1 rounded-full bg-lilac px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">You</span>}
                </p>
                <p className="text-xs text-mist">
                  {Number(r.exact_scores)} exact
                  {tab === "all"
                    ? ` · ${Number(r.rounds_played ?? 0)} rounds · ${Number(r.wins ?? 0)} wins`
                    : ` · ${Number(r.predicted ?? 0)} predicted`}
                </p>
              </div>
              <p className="text-right text-xl font-extrabold text-lilac-soft">{Number(r.points)}</p>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
