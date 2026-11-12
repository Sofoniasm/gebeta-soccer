import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatEtb, formatKickoff } from "@/lib/format";
import { unitsToEtb } from "@/lib/money";
import { TrophyIcon } from "./icons";

interface Winner { round_id: number; username: string; slip_no: number; units: number; points: number }

/** Last settled rounds: pool, slips and who won (or that nobody passed the bar). Public, for trust. */
export async function RecentWinners({ limit = 3 }: { limit?: number }) {
  const supabase = await createClient();
  const { data: rounds } = await supabase
    .from("rounds")
    .select("id, name, settled_at")
    .eq("status", "settled")
    .order("settled_at", { ascending: false })
    .limit(limit);
  const list = (rounds ?? []) as { id: number; name: string; settled_at: string | null }[];
  if (list.length === 0) return null;

  const [{ data: w }, pools] = await Promise.all([
    supabase.rpc("get_round_winners", { p_round_ids: list.map((r) => r.id) }),
    Promise.all(list.map((r) => supabase.rpc("get_round_pool", { p_round_id: r.id }).maybeSingle())),
  ]);
  const winners = ((w ?? []) as Winner[]).map((x) => ({ ...x, units: Number(x.units), points: Number(x.points) }));

  return (
    <section className="mt-6 rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6">
      <h2 className="flex items-center gap-2 text-lg font-extrabold">
        <TrophyIcon size={18} /> Recent winners
      </h2>
      <ul className="mt-3 divide-y divide-white/5">
        {list.map((r, i) => {
          const p = (pools[i]?.data ?? {}) as { entrants?: number; players?: number; pool_units?: number };
          const slips = Number(p.entrants ?? 0);
          const won = winners.filter((x) => x.round_id === r.id);
          return (
            <li key={r.id} className="py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-bold text-white">{r.name}</p>
                <p className="text-xs text-mist">
                  {slips} slip{slips === 1 ? "" : "s"} · {Number(p.players ?? 0)} player{Number(p.players ?? 0) === 1 ? "" : "s"} · pool {formatEtb(unitsToEtb(Number(p.pool_units ?? 0)))}
                  {r.settled_at ? ` · settled ${formatKickoff(r.settled_at)} EAT` : ""}
                </p>
              </div>
              {won.length > 0 ? (
                <ul className="mt-1.5 space-y-1">
                  {won.map((x) => (
                    <li key={`${x.username}-${x.slip_no}`} className="text-sm text-mist">
                      🏆 <b className="text-white">{x.username}</b>
                      {x.slip_no > 1 ? ` (slip #${x.slip_no})` : ""} · {x.points} pts · won{" "}
                      <b className="text-emerald-200">{formatEtb(unitsToEtb(x.units))}</b>
                      {slips > won.length ? ` · beat ${slips - won.length} other slip${slips - won.length === 1 ? "" : "s"}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1.5 text-sm text-mist">No winner: nobody passed the winning bar, so the pool stayed with the house.</p>
              )}
            </li>
          );
        })}
      </ul>
      <Link href="/results" className="mt-2 inline-block text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
        My results →
      </Link>
    </section>
  );
}
