import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { MatchRow } from "@/lib/rounds";

interface Crowd { match_id: number; slips: number; home_pct: number; draw_pct: number; away_pct: number; top_score: string; top_score_pct: number }

/** Anonymous crowd picks: Premium while the round is open, free for everyone once it locks. */
export async function CrowdPicks({ roundId, matches, premium, locked = false }: { roundId: number; matches: MatchRow[]; premium: boolean; locked?: boolean }) {
  const shell = "mt-6 rounded-[2rem] border border-amber-200/20 bg-card/60 p-5 sm:p-6";
  if (!premium) {
    return (
      <section className={shell}>
        <h2 className="text-lg font-extrabold">⭐ Crowd picks</h2>
        <div className="relative mt-3">
          <div className="pointer-events-none select-none space-y-2 blur-sm" aria-hidden="true">
            {matches.slice(0, 3).map((m) => (
              <div key={m.id} className="rounded-2xl bg-ink/40 px-4 py-3 text-sm">
                {m.home_team} – {m.away_team} · 58% · 21% · 21% · 2-1
              </div>
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <p className="text-sm font-bold text-white">See how everyone else is picking before you bet</p>
            <p className="text-xs text-mist">Free for everyone once the round locks</p>
            <Link href="/premium" className="mt-2 rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
              Unlock with Premium
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_round_crowd", { p_round_id: roundId });
  const crowd = new Map(((data ?? []) as Crowd[]).map((c) => [Number(c.match_id), c]));
  return (
    <section className={shell}>
      <h2 className="text-lg font-extrabold">{locked ? "📊 How the crowd picked" : "⭐ Crowd picks"}</h2>
      {crowd.size === 0 ? (
        <p className="mt-2 text-sm text-mist">Shown once at least 5 slips are in, so nobody&apos;s own picks can be worked out. Check back soon.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {matches.map((m) => {
            const c = crowd.get(m.id);
            if (!c) return null;
            const bar = [
              { w: Number(c.home_pct), cls: "bg-lilac", t: `${m.home_team} ${Number(c.home_pct)}%` },
              { w: Number(c.draw_pct), cls: "bg-white/40", t: `Draw ${Number(c.draw_pct)}%` },
              { w: Number(c.away_pct), cls: "bg-amber-200", t: `${m.away_team} ${Number(c.away_pct)}%` },
            ];
            return (
              <li key={m.id} className="rounded-2xl bg-ink/40 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="font-semibold">{m.home_team} – {m.away_team}</span>
                  <span className="text-xs text-mist">most picked <b className="font-mono text-white">{c.top_score}</b> ({Number(c.top_score_pct)}%) · {Number(c.slips)} slips</span>
                </div>
                <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/5">
                  {bar.map((b) => <span key={b.t} className={b.cls} style={{ width: `${b.w}%` }} title={b.t} />)}
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-mist">
                  <span>Home {Number(c.home_pct)}%</span><span>Draw {Number(c.draw_pct)}%</span><span>Away {Number(c.away_pct)}%</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
