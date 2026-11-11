import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import type { MatchRow } from "@/lib/rounds";
import { AppShell } from "@/components/AppShell";
import { Crest, PointsChip, dayOf, statusLabel, timeOf } from "@/components/MatchLine";
import { EyeIcon, LockIcon } from "@/components/icons";

export const metadata = { title: "Match · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface Pick {
  username: string;
  slip_no: number;
  slips_count: number;
  home: number;
  away: number;
  points: number | null;
  is_default: boolean;
  is_me: boolean;
}

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await getMe(`/match/${id}`);
  const supabase = await createClient();

  const { data: match } = await supabase.from("matches").select("*, rounds(id, name, status)").eq("id", Number(id)).maybeSingle();
  if (!match) notFound();
  const m = match as MatchRow & { rounds: { id: number; name: string; status: string } | null };

  // Picks become visible when the round locks (its first kickoff).
  const { data: lockData } = m.round_id ? await supabase.rpc("round_lock_at", { p_round_id: m.round_id }) : { data: null };
  const lockAt = (lockData as string | null) ?? m.kickoff_at;
  const started = new Date(lockAt).getTime() <= Date.now() || m.status !== "scheduled";
  const [{ data: picksData }, { data: countData }, { data: mine }] = await Promise.all([
    started ? supabase.rpc("get_match_picks", { p_match_id: m.id }) : Promise.resolve({ data: [] }),
    supabase.rpc("get_match_pick_count", { p_match_id: m.id }),
    supabase
      .from("slip_picks")
      .select("home, away, slips!inner(slip_no, user_id)")
      .eq("match_id", m.id)
      .eq("slips.user_id", me.id),
  ]);
  const picks = ((picksData ?? []) as Pick[]).map((p) => ({ ...p, points: p.points === null ? null : Number(p.points) }));
  const pickCount = Number(countData ?? 0);
  const myPicks = ((mine ?? []) as unknown as { home: number; away: number; slips: { slip_no: number } }[]).sort(
    (a, b) => a.slips.slip_no - b.slips.slip_no,
  );

  // Pick split: home win / draw / away win, and the most popular scores
  const total = picks.length;
  const homeW = picks.filter((p) => p.home > p.away).length;
  const draw = picks.filter((p) => p.home === p.away).length;
  const awayW = total - homeW - draw;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  const scores = new Map<string, number>();
  for (const p of picks) scores.set(`${p.home}-${p.away}`, (scores.get(`${p.home}-${p.away}`) ?? 0) + 1);
  const popular = [...scores.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const hasScore = m.actual_home_score !== null && m.actual_away_score !== null && m.status !== "scheduled";

  return (
    <AppShell next={`/match/${id}`}>
      <Link href="/fixtures" className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
        ← Fixtures
      </Link>

      {/* Header */}
      <section className="relative overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-br from-[#3a3166] via-card to-ink p-6 sm:p-8">
        <p className="text-center text-xs font-bold uppercase tracking-[0.2em] text-lilac">
          {m.rounds ? m.rounds.name : m.competition ?? "Match"} · {dayOf(m.kickoff_at)} · {timeOf(m.kickoff_at)}
        </p>
        <div className="mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-4">
          <div className="flex flex-col items-center gap-2 text-center">
            <Crest src={m.home_crest} name={m.home_team} size={56} />
            <p className="font-extrabold">{m.home_team}</p>
          </div>
          <div className="text-center">
            <p className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              {hasScore ? `${m.actual_home_score} – ${m.actual_away_score}` : "v"}
            </p>
            <p className={`mt-1 text-xs font-bold ${m.status === "live" ? "animate-pulse text-rose-300" : "text-mist"}`}>{statusLabel(m)}</p>
          </div>
          <div className="flex flex-col items-center gap-2 text-center">
            <Crest src={m.away_crest} name={m.away_team} size={56} />
            <p className="font-extrabold">{m.away_team}</p>
          </div>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 border-t border-white/10 pt-4 text-sm">
          <span className="text-mist">Your pick{myPicks.length > 1 ? "s" : ""}:</span>
          {myPicks.length ? (
            myPicks.map((p) => (
              <span key={p.slips.slip_no} className="rounded-full bg-lilac/20 px-3 py-1 font-extrabold text-lilac-soft">
                {myPicks.length > 1 && <span className="mr-1 text-[10px] text-mist">#{p.slips.slip_no}</span>}
                {p.home} – {p.away}
              </span>
            ))
          ) : (
            <span className="text-mist/70">none</span>
          )}
          <span className="text-mist">· {pickCount} player{pickCount === 1 ? "" : "s"} picked</span>
        </div>
      </section>

      {!started ? (
        <div className="mt-5 rounded-[2rem] border border-white/5 bg-card/60 p-8 text-center">
          <LockIcon size={24} className="mx-auto text-lilac" />
          <p className="mt-2 font-bold">Picks are hidden until the round locks</p>
          <p className="mt-1 text-sm text-mist">At the first kickoff of the round ({timeOf(lockAt)}) everyone&apos;s slips and the pick split appear here.</p>
          {m.rounds?.status === "open" && (
            <Link href="/dashboard" className="mt-4 inline-block rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
              {myPicks.length ? "Edit my slips" : "Place a slip"}
            </Link>
          )}
        </div>
      ) : total === 0 ? (
        <p className="mt-5 rounded-[2rem] border border-white/5 bg-card/60 p-8 text-center text-sm text-mist">Nobody picked this match.</p>
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,22rem)_1fr]">
          {/* Split */}
          <section className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-extrabold">
              <EyeIcon size={18} className="text-lilac" /> How players picked
            </h2>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
              <div className="bg-lilac" style={{ width: `${pct(homeW)}%` }} />
              <div className="bg-white/40" style={{ width: `${pct(draw)}%` }} />
              <div className="bg-sky-300" style={{ width: `${pct(awayW)}%` }} />
            </div>
            <div className="mt-3 grid grid-cols-3 text-center text-xs">
              <div>
                <p className="text-lg font-extrabold text-lilac-soft">{pct(homeW)}%</p>
                <p className="truncate text-mist">{m.home_team}</p>
              </div>
              <div>
                <p className="text-lg font-extrabold">{pct(draw)}%</p>
                <p className="text-mist">Draw</p>
              </div>
              <div>
                <p className="text-lg font-extrabold text-sky-200">{pct(awayW)}%</p>
                <p className="truncate text-mist">{m.away_team}</p>
              </div>
            </div>
            <h3 className="mb-2 mt-6 text-xs font-bold uppercase tracking-[0.15em] text-lilac">Most popular scores</h3>
            <ul className="space-y-1.5">
              {popular.map(([score, n]) => (
                <li key={score} className="flex items-center gap-3 text-sm">
                  <span className="w-12 font-extrabold">{score.replace("-", " – ")}</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                    <span className="block h-full rounded-full bg-lilac/70" style={{ width: `${(n / total) * 100}%` }} />
                  </span>
                  <span className="w-10 text-right text-xs text-mist">{pct(n)}%</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Everyone's picks */}
          <section className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
            <h2 className="mb-4 text-lg font-extrabold">Everyone&apos;s slips</h2>
            <ul className="divide-y divide-white/5">
              {picks.map((p, i) => (
                <li key={`${p.username}-${p.slip_no}-${i}`} className={`flex items-center gap-3 py-2.5 ${p.is_me ? "-mx-3 rounded-xl bg-lilac/10 px-3" : ""}`}>
                  <span className="flex-1 truncate font-semibold">
                    {p.username}
                    {Number(p.slips_count) > 1 && <span className="ml-1 text-xs text-mist">#{p.slip_no}</span>}
                    {p.is_me && <span className="ml-1.5 text-xs text-lilac">(you)</span>}
                  </span>
                  <span className="font-extrabold">
                    {p.home} – {p.away}
                    {p.is_default && <span className="ml-1 text-[10px] text-amber-200" title="Default pick">D</span>}
                  </span>
                  <span className="w-16 text-right">
                    <PointsChip points={p.points} />
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-mist">
              Players with several slips appear once per slip (#1, #2…).
            </p>
          </section>
        </div>
      )}
    </AppShell>
  );
}
