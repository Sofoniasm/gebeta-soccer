import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getActiveRounds, getCurrentRound } from "@/lib/rounds";
import { AppShell } from "@/components/AppShell";
import { TrophyIcon } from "@/components/icons";
import { Avatar } from "@/components/Avatar";
import { getMe } from "@/lib/me";
import { getMyPremium } from "@/lib/premium";

export const metadata = { title: "Leaderboard · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface Row {
  rank: number;
  username: string;
  points: number;
  exact_scores: number;
  is_me: boolean;
  predicted?: number;
  correct_results?: number;
  slam_points?: number;
  rounds_played?: number;
  wins?: number;
  slip_no?: number;
  slips_count?: number;
  slip_id?: number;
}

function Medal({ rank }: { rank: number }) {
  const style =
    rank === 1 ? "bg-gradient-to-br from-[#f3e7a3] to-[#c9a74a] text-ink"
    : rank === 2 ? "bg-gradient-to-br from-white to-[#b9b6c8] text-ink"
    : rank === 3 ? "bg-gradient-to-br from-[#e6b48a] to-[#a86b43] text-ink"
    : "bg-white/10 text-mist";
  return <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${style}`}>{rank}</span>;
}

export default async function LeaderboardPage({ searchParams }: { searchParams: Promise<{ tab?: string; round?: string }> }) {
  const { tab = "round", round: roundParam } = await searchParams;
  const supabase = await createClient();
  // Daily rounds: pick one (default: a round in play, else the one closing soonest, else the last settled).
  const active = await getActiveRounds(supabase, { includeTest: (await getMe("/leaderboard")).is_admin });
  const chosen = active.find((r) => String(r.id) === roundParam) ?? active.find((r) => !r.bettable) ?? active[0] ?? null;
  const round = chosen ?? (await getCurrentRound(supabase, { includeTest: (await getMe("/leaderboard")).is_admin }));

  let rows: Row[] = [];
  if (tab === "all") {
    const { data } = await supabase.rpc("get_overall_leaderboard", { p_limit: 100 });
    rows = (data ?? []) as Row[];
  } else if (round) {
    const { data } = await supabase.rpc("get_round_leaderboard", { p_round_id: round.id });
    rows = (data ?? []) as Row[];
  }
  const me = rows.find((r) => r.is_me);
  const viewer = await getMe("/leaderboard");
  const premium = (await getMyPremium(supabase, viewer.id)).active;
  // Picks become visible when the round locks (first kickoff); before that, secret for everyone.
  const locked = !!round && (round.status !== "open" || !active.find((r) => r.id === round.id)?.bettable);
  const names = [...new Set(rows.map((r) => r.username))];
  const { data: avatarRows } = names.length ? await supabase.rpc("get_avatars", { p_usernames: names }) : { data: [] };
  const avatarOf = new Map(((avatarRows ?? []) as { username: string; avatar_url: string }[]).map((a) => [a.username, a.avatar_url]));

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
        {tab !== "all" && active.length > 1 && (
          <div className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {active.map((r) => (
              <Link
                key={r.id}
                href={`/leaderboard?round=${r.id}`}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${r.id === round?.id ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}
              >
                {r.name}
              </Link>
            ))}
          </div>
        )}
        {me && (
          <p className="rounded-full bg-lilac/15 px-4 py-2 text-sm font-bold text-lilac-soft">
            You: #{me.rank} · {Number(me.points)} pts
          </p>
        )}
      </div>

      {tab !== "all" && round && round.status !== "settled" && (
        <p className="mb-4 text-xs text-mist">Live: points update as matches finish, including Slam Points. The top slip wins, whatever its score. Ties: correct results → exact scores → close picks.</p>
      )}

      {tab !== "all" && round && !premium && rows.length > 0 && (
        <Link href="/premium" className="mb-4 flex items-center gap-3 rounded-2xl border border-amber-200/25 bg-amber-200/5 px-4 py-3 hover:border-amber-200/50">
          <span className="text-xl">⭐</span>
          <span className="min-w-0 flex-1 text-sm">
            <b className="text-white">See the leaders&apos; full slips</b>
            <span className="block text-xs text-mist">Gebeta Premium unlocks every slip once the round locks, plus crowd picks while it&apos;s open.</span>
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-amber-100">Go Premium →</span>
        </Link>
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
            <span className="pl-10">Player</span>
            <span className="text-right">Points</span>
          </div>
          {rows.map((r, i) => (
            <div
              key={`${r.username}-${i}`}
              className={`grid grid-cols-[auto_auto_1fr_auto] items-center gap-3 border-b border-white/5 px-5 py-3 last:border-0 sm:gap-4 ${
                r.is_me ? "bg-lilac/10" : ""
              }`}
            >
              <Medal rank={Number(r.rank)} />
              <Avatar name={r.username} src={avatarOf.get(r.username)} size={34} />
              <div className="min-w-0">
                <p className="truncate font-bold">
                  {r.username}
                  {Number(r.slips_count ?? 1) > 1 && <span className="ml-1 text-mist">#{r.slip_no}</span>}{" "}
                  {r.is_me && <span className="ml-1 rounded-full bg-lilac px-2 py-0.5 text-[10px] font-extrabold uppercase text-ink">You</span>}
                </p>
                <p className="text-xs text-mist">
                  {Number(r.exact_scores)} exact
                  {tab === "all"
                    ? ` · ${Number(r.rounds_played ?? 0)} rounds · ${Number(r.wins ?? 0)} wins`
                    : ` · ${Number(r.correct_results ?? 0)} correct${Number(r.slam_points ?? 0) > 0 ? ` · +${Number(r.slam_points)} slam` : ""}`}
                </p>
              </div>
              <div className="flex items-center justify-end gap-3">
                {tab !== "all" && r.slip_id && locked && (
                  r.is_me || premium ? (
                    <Link href={`/slip/${r.slip_id}`} className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white hover:border-lilac">
                      Picks
                    </Link>
                  ) : (
                    <Link href="/premium" title="Gebeta Premium" className="rounded-full border border-amber-200/30 px-3 py-1 text-[11px] font-bold text-amber-100 hover:bg-amber-200/10">
                      🔒 Picks
                    </Link>
                  )
                )}
                <p className="text-right text-xl font-extrabold text-lilac-soft">{Number(r.points)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
