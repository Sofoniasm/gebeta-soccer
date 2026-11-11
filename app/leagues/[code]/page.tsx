import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { etbLabel, unitsLabel } from "@/lib/money";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { TrophyIcon, UsersIcon } from "@/components/icons";
import { CopyInvite, JoinLeagueBox } from "../LeagueForms";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `League ${decodeURIComponent(code).toUpperCase()} · GebetaSoccer` };
}

interface League {
  id: number;
  code: string;
  name: string;
  captain_id: string;
  round_id: number;
  entry_fee_units: number;
  house_cut: number;
  status: string;
  rounds: { name: string; status: string } | null;
}
interface Member {
  username: string;
  status: string;
  is_captain: boolean;
  is_me: boolean;
}
interface Row {
  rank: number;
  username: string;
  points: number;
  slam_points: number;
  correct_results: number;
  exact_scores: number;
  close_picks: number;
  predicted: number;
  is_me: boolean;
}

export default async function LeaguePage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase();
  const { created } = await searchParams;
  const me = await getMe(`/leagues/${code}`);
  const supabase = await createClient();

  // Only members can list leagues; anyone signed in can open one by its exact code.
  const { data } = await supabase.rpc("get_league_by_code", { p_code: code }).maybeSingle();
  const row = data as (Omit<League, "rounds"> & { round_name: string; round_status: string }) | null;
  const league: League | null = row ? { ...row, rounds: { name: row.round_name, status: row.round_status } } : null;
  if (!league) {
    return (
      <AppShell title="League not found" next="/leagues">
        <p className="text-sm text-mist">
          No league has the code <b className="text-white">{code}</b>. Check the code with your friend, or{" "}
          <Link href="/leagues" className="font-bold text-lilac">create your own league →</Link>
        </p>
      </AppShell>
    );
  }

  const [{ data: myRow }, { data: poolData }, { data: membersData }, { data: tableData }] = await Promise.all([
    supabase.from("league_members").select("status").eq("league_id", league.id).eq("user_id", me.id).maybeSingle(),
    supabase.rpc("get_league_pool", { p_league_id: league.id }).maybeSingle(),
    supabase.rpc("get_league_members", { p_league_id: league.id }),
    supabase.rpc("get_league_leaderboard", { p_league_id: league.id }),
  ]);
  const myStatus = ((myRow as { status: string } | null)?.status ?? "none") as "none" | "pending" | "active" | "rejected";
  const pool = (poolData ?? { members: 0, pending: 0, pool_units: 0, prize_fund_units: 0 }) as {
    members: number;
    pending: number;
    pool_units: number;
    prize_fund_units: number;
  };
  const members = (membersData ?? []) as Member[];
  const table = ((tableData ?? []) as Row[]).map((r) => ({ ...r, points: Number(r.points), slam_points: Number(r.slam_points) }));
  const fee = Number(league.entry_fee_units);
  const isCaptain = league.captain_id === me.id;
  const canSeeInside = myStatus === "active" || isCaptain;
  const open = league.status === "open" && league.rounds?.status === "open";
  const site = SITE_URL;
  const inviteUrl = `${site}/join/${league.code}`;
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  return (
    <AppShell next={`/leagues/${code}`}>
      <Link href="/leagues" className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
        ← My leagues
      </Link>
      {created && <div className="mb-4"><Banner kind="success">League created! Share the invite link below with your friends.</Banner></div>}

      {/* Header */}
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-br from-[#3a3166] via-card to-ink p-6">
        <div className="animate-glow pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-lilac/25 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">
              Private league · {fee > 0 ? "Paid" : "Free"} · {league.status === "settled" ? "Finished" : league.rounds?.name}
            </p>
            <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{league.name}</h1>
            <p className="mt-1 text-sm text-mist">
              Code <b className="text-white">{league.code}</b> · {fee > 0 ? `Entry ${unitsLabel(fee)} (${etbLabel(fee)})` : "Free to join"}
            </p>
          </div>
          <div className="text-right">
            {fee > 0 && (
              <>
                <p className="flex items-center justify-end gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">
                  <TrophyIcon size={13} /> Winner gets
                </p>
                <p className="text-3xl font-extrabold">{etbLabel(Number(pool.prize_fund_units))}</p>
              </>
            )}
            <p className="flex items-center justify-end gap-1 text-xs text-mist">
              <UsersIcon size={13} /> {pool.members} player{Number(pool.members) === 1 ? "" : "s"}
              {Number(pool.pending) > 0 && ` · ${pool.pending} waiting`}
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <div className="space-y-5">
          {/* Join */}
          {myStatus !== "active" && (
            <section className={card}>
              <h2 className="mb-3 text-lg font-extrabold">{open ? "Join this league" : "This league is closed"}</h2>
              {open ? (
                <JoinLeagueBox code={league.code} fee={fee} balance={me.balance_units} status={myStatus === "none" ? "none" : myStatus} />
              ) : (
                <p className="text-sm text-mist">Its round has already started or finished.</p>
              )}
            </section>
          )}

          {/* Table */}
          {canSeeInside && (
            <section className={card}>
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-extrabold">League table</h2>
                {myStatus === "active" && open && (
                  <Link href="/dashboard" className="text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
                    My slips →
                  </Link>
                )}
              </div>
              {table.length === 0 ? (
                <p className="py-6 text-center text-sm text-mist">The table fills up once players join and matches are played.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-mist/70">
                        <th className="py-3 pr-3">#</th>
                        <th className="py-3 pr-3">Player</th>
                        <th className="py-3 pr-3 text-right">Exact</th>
                        <th className="py-3 pr-3 text-right">Correct</th>
                        <th className="py-3 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {table.map((r) => (
                        <tr key={r.username} className={r.is_me ? "bg-lilac/10" : ""}>
                          <td className="py-3 pr-3 font-extrabold">{r.rank === 1 ? "🏆" : r.rank}</td>
                          <td className="py-3 pr-3 font-bold">
                            {r.username}
                            {r.is_me && <span className="ml-1 text-xs text-lilac">(you)</span>}
                          </td>
                          <td className="py-3 pr-3 text-right">{r.exact_scores}</td>
                          <td className="py-3 pr-3 text-right">{r.correct_results}</td>
                          <td className="py-3 text-right font-extrabold text-lilac-soft">
                            {r.points}
                            {r.slam_points > 0 && <span className="ml-1 text-[10px] text-amber-200">+{r.slam_points}</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-mist">
                Each member&apos;s <b className="text-white">Slip #1</b> in {league.rounds?.name ?? "the round"} is their league entry, so place a slip on the Predict page to play. Same scoring as the main game: exact 3 · close 1.5 · result 1, plus Slam Points.
                {fee > 0 && " The winner takes 70% of the league pot (ties share it) when the round is settled. To win, they need more than 15 of the 30 match points; otherwise the pot goes to the house."}
              </p>
            </section>
          )}
        </div>

        <div className="space-y-5">
          {/* Invite */}
          {canSeeInside && open && (
            <section className={card}>
              <h2 className="mb-1 text-lg font-extrabold">Invite friends</h2>
              <p className="mb-3 text-xs text-mist">Anyone with this link or code can join{fee > 0 ? " after paying the entry fee" : ""}.</p>
              <CopyInvite url={inviteUrl} code={league.code} name={league.name} />
            </section>
          )}

          {/* Members */}
          {canSeeInside && (
            <section className={card}>
              <h2 className="mb-3 text-lg font-extrabold">Players</h2>
              <ul className="space-y-2">
                {members.map((m) => (
                  <li key={m.username} className="flex items-center gap-3 text-sm">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lilac/15 text-xs font-extrabold text-lilac">
                      {m.username.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="flex-1 truncate font-semibold">
                      {m.username}
                      {m.is_me && <span className="ml-1 text-xs text-lilac">(you)</span>}
                    </span>
                    {m.is_captain && <span className="text-[10px] font-bold uppercase text-lilac">Captain</span>}
                    {m.status === "pending" && (
                      <span className="rounded-full bg-amber-200/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-100">Awaiting payment</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </AppShell>
  );
}
