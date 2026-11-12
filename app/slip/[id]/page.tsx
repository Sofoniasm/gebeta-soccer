import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { formatKickoff } from "@/lib/format";

export const metadata = { title: "Slip · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface Line {
  username: string; slip_no: number; round_id: number; round_name: string; match_id: number; home_team: string; away_team: string;
  kickoff_at: string; status: string; actual_home: number | null; actual_away: number | null; home: number | null; away: number | null; points: number | null;
}

/** One player's full slip (Premium, after the round locks; your own slip any time). */
export default async function SlipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_slip_detail", { p_slip_id: Number(id) });

  if (error) {
    const premium = error.message.includes("premium only");
    const secret = error.message.includes("secret");
    return (
      <AppShell title="Slip" next={`/slip/${id}`}>
        <div className="mx-auto max-w-lg rounded-[2rem] border border-amber-200/20 bg-card/60 p-8 text-center">
          <p className="text-4xl">{premium ? "⭐" : "🔒"}</p>
          <h2 className="mt-2 text-xl font-extrabold">
            {premium ? "Unlock with Gebeta Premium" : secret ? "Picks are secret until the round locks" : "Slip not found"}
          </h2>
          <p className="mt-2 text-sm text-mist">
            {premium
              ? "Premium shows every player's full slip as soon as the round locks, plus anonymous crowd picks while it's open."
              : secret
                ? "Nobody can see other players' picks before the first kickoff. Come back once the round locks."
                : "This slip doesn't exist."}
          </p>
          {premium && (
            <Link href="/premium" className="mt-5 inline-block rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
              See Premium
            </Link>
          )}
        </div>
      </AppShell>
    );
  }

  const lines = (data ?? []) as Line[];
  if (lines.length === 0) notFound();
  const head = lines[0];
  const total = lines.reduce((s, l) => s + Number(l.points ?? 0), 0);

  return (
    <AppShell next={`/slip/${id}`}>
      <Link href={`/leaderboard?round=${head.round_id}`} className="text-xs font-bold uppercase tracking-wider text-lilac">← Leaderboard</Link>
      <h1 className="mt-2 text-2xl font-extrabold tracking-tight">
        {head.username}
        {head.slip_no > 1 ? ` · slip #${head.slip_no}` : ""}
      </h1>
      <p className="mb-5 text-sm text-mist">
        {head.round_name} · <b className="text-white">{total} pts</b> from matches so far
      </p>
      <div className="space-y-2">
        {lines.map((l) => {
          const done = l.actual_home !== null && l.actual_away !== null && l.status !== "scheduled";
          return (
            <div key={l.match_id} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-white/5 bg-card/50 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{l.home_team} – {l.away_team}</p>
                <p className="text-[11px] text-mist">
                  {formatKickoff(l.kickoff_at)} EAT{done ? ` · result ${l.actual_home}-${l.actual_away}` : l.status === "live" ? " · live" : ""}
                </p>
              </div>
              <span className="rounded-xl bg-ink/60 px-3 py-1.5 font-mono text-sm font-bold">{l.home ?? "–"}-{l.away ?? "–"}</span>
              <span className={`w-12 text-right text-sm font-extrabold ${Number(l.points ?? 0) > 0 ? "text-emerald-200" : "text-mist"}`}>
                {l.points === null ? "" : `+${Number(l.points)}`}
              </span>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
