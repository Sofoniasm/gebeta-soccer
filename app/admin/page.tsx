import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoundPool, type MatchRow, type RoundRow } from "@/lib/rounds";
import { computeSlipSettlement } from "@/lib/slip-settle";
import { formatKickoff } from "@/lib/format";
import { formatUnits, etbLabel } from "@/lib/money";
import { assignMatches, createRound, removeMatch, setRoundStatus, setScore, settle, syncNow } from "./actions";
import { AppShell } from "@/components/AppShell";
import { Banner, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { RefreshIcon, TrophyIcon } from "@/components/icons";
import { SubmitButton } from "./SubmitButton";
import { MatchPicker } from "./MatchPicker";

export const metadata = { title: "Rounds · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
const small = "rounded-xl border border-white/10 bg-ink/70 px-2 py-2 text-sm text-white outline-none focus:border-lilac";

function Step({ n, title, children, done = false }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className={card}>
      <div className="mb-4 flex items-center gap-3">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold ${done ? "bg-emerald-300/20 text-emerald-200" : "bg-lilac text-ink"}`}>
          {done ? "✓" : n}
        </span>
        <h2 className="text-lg font-extrabold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default async function RoundsAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdminId("/admin");
  const { msg, err } = await searchParams;
  const admin = createAdminClient();

  const { data: activeRound } = await admin
    .from("rounds").select("*").in("status", ["draft", "open", "locked"]).order("id", { ascending: false }).limit(1).maybeSingle();
  const round = activeRound as RoundRow | null;

  const roundMatches: MatchRow[] = round
    ? (((await admin.from("matches").select("*").eq("round_id", round.id).order("kickoff_at")).data ?? []) as MatchRow[])
    : [];
  const pool = round ? await getRoundPool(admin, round.id) : null;

  const { data: upcomingData } = await admin
    .from("matches").select("*").is("round_id", null).eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString()).order("kickoff_at").limit(80);
  const upcoming = (upcomingData ?? []) as MatchRow[];

  const { data: recentData } = await admin.from("rounds").select("*").order("id", { ascending: false }).limit(8);
  const recent = (recentData ?? []) as RoundRow[];

  // ---- settlement preview (only when every match has a result)
  const allDone =
    roundMatches.length > 0 &&
    roundMatches.every((m) => ["cancelled", "postponed"].includes(m.status) || (m.status === "finished" && m.actual_home_score !== null && m.actual_away_score !== null));
  // Every slip placed in this round (with phone numbers) + settlement preview
  const slipCalc = round ? await computeSlipSettlement(admin, round) : null;
  let preview: { username: string; units: number }[] = [];
  let previewTotals: { pool: number; prize: number; house: number } | null = null;
  if (slipCalc && allDone) {
    preview = slipCalc.payouts.map((p) => ({ username: `${p.slip.username} · Slip #${p.slip.slip_no}`, units: p.units }));
    previewTotals = {
      pool: slipCalc.result.poolUnits,
      prize: slipCalc.payouts.reduce((s, x) => s + x.units, 0),
      house: slipCalc.result.houseUnits,
    };
  }
  const slipsPerPlayer = new Map<string, number>();
  for (const sl of slipCalc?.slips ?? []) slipsPerPlayer.set(sl.user_id, (slipsPerPlayer.get(sl.user_id) ?? 0) + 1);

  const finishedCount = roundMatches.filter((m) => m.status === "finished").length;

  return (
    <AppShell title="Rounds" next="/admin">
      <div className="mb-5 space-y-3">
        {msg && <Banner kind="success">{msg}</Banner>}
        {err && <Banner kind="error">{err}</Banner>}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <div className="space-y-5">
          {/* STEP 1 — sync */}
          <Step n={1} title="Get matches" done={upcoming.length > 0 || roundMatches.length > 0}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-mist">
                Pull the next 7 days of fixtures from football-data.org. {upcoming.length > 0 && <b className="text-white">{upcoming.length} upcoming matches ready.</b>}
              </p>
              <form action={syncNow}>
                <SubmitButton className={secondaryButtonClass}><RefreshIcon size={14} /> Sync matches</SubmitButton>
              </form>
            </div>
          </Step>

          {/* STEP 2 — create round */}
          {!round ? (
            <Step n={2} title="Create a round">
              <form action={createRound} className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-mist">Round name</span>
                  <input name="name" required placeholder="Week 1" className={inputClass} />
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-semibold text-mist">Entry (units)</span>
                  <input name="entryFee" type="number" step="0.5" min="0.5" defaultValue="1" className={inputClass} />
                </label>
                <SubmitButton className={`${primaryButtonClass} sm:w-auto`}>Create round</SubmitButton>
              </form>
            </Step>
          ) : (
            <>
              {/* STEP 2 — pick matches */}
              <Step n={2} title={`Pick 10 matches for ${round.name}`} done={roundMatches.length === 10}>
                <div className="mb-3 flex flex-wrap items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${roundMatches.length === 10 ? "bg-emerald-300" : "bg-lilac"}`} style={{ width: `${roundMatches.length * 10}%` }} />
                  </div>
                  <span className={`text-sm font-extrabold ${roundMatches.length === 10 ? "text-emerald-200" : "text-white"}`}>{roundMatches.length}/10 matches</span>
                </div>
                {round.status === "draft" && (
                  <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4 ${roundMatches.length === 10 ? "border-emerald-300/30 bg-emerald-300/10" : "border-white/10 bg-ink/40"}`}>
                    <p className="text-sm text-mist">
                      {roundMatches.length === 10
                        ? "All 10 matches picked. Open the round so players can join and predict."
                        : `Draft — players can't see this round yet. Add ${10 - roundMatches.length} more match${10 - roundMatches.length === 1 ? "" : "es"}.`}
                    </p>
                    <form action={setRoundStatus}>
                      <input type="hidden" name="roundId" value={round.id} />
                      <input type="hidden" name="status" value="open" />
                      {roundMatches.length === 10 ? (
                        <SubmitButton className={`${primaryButtonClass} sm:w-auto`} confirm={`Open ${round.name} for players with these 10 matches?`}>
                          Open round for players
                        </SubmitButton>
                      ) : (
                        <button type="button" disabled className={`${primaryButtonClass} cursor-not-allowed opacity-40 sm:w-auto`}>Open round (needs 10)</button>
                      )}
                    </form>
                  </div>
                )}
                {roundMatches.length >= 10 ? null : upcoming.length === 0 ? (
                  <p className="text-sm text-mist">No upcoming matches available — press <b>Sync matches</b> above.</p>
                ) : (
                  <MatchPicker
                    roundId={round.id}
                    room={10 - roundMatches.length}
                    matches={upcoming.map((m) => ({ id: m.id, label: `${m.home_team} vs ${m.away_team}`, when: formatKickoff(m.kickoff_at), competition: m.competition }))}
                    action={assignMatches}
                  />
                )}
              </Step>

              {/* STEP 3 — results */}
              <Step n={3} title="Enter results" done={allDone}>
                <p className="mb-3 text-sm text-mist">
                  Scores sync automatically once a day. You can also type or correct them here. <b className="text-white">{finishedCount}/{roundMatches.length}</b> finished.
                </p>
                <div className="space-y-2">
                  {roundMatches.length === 0 && <p className="text-sm text-mist">No matches in this round yet.</p>}
                  {roundMatches.map((m) => (
                    <div key={m.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-ink/40 p-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold">{m.home_team} vs {m.away_team}</p>
                        <p className="text-xs text-mist">{formatKickoff(m.kickoff_at)} · <span className={m.status === "finished" ? "text-emerald-200" : ""}>{m.status}</span></p>
                      </div>
                      <form action={setScore} className="flex items-center gap-1.5">
                        <input type="hidden" name="matchId" value={m.id} />
                        <input type="hidden" name="status" value="finished" />
                        <input name="home" type="number" min="0" defaultValue={m.actual_home_score ?? ""} className={`${small} w-14 text-center`} aria-label="Home score" />
                        <span className="text-mist">–</span>
                        <input name="away" type="number" min="0" defaultValue={m.actual_away_score ?? ""} className={`${small} w-14 text-center`} aria-label="Away score" />
                        <SubmitButton className={secondaryButtonClass}>Save</SubmitButton>
                      </form>
                      <div className="flex gap-3">
                        <form action={setScore}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <input type="hidden" name="status" value="postponed" />
                          <SubmitButton className="text-xs text-mist hover:text-white">Postponed</SubmitButton>
                        </form>
                        <form action={removeMatch}>
                          <input type="hidden" name="matchId" value={m.id} />
                          <SubmitButton className="text-xs text-rose-300 hover:text-rose-200">Remove</SubmitButton>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              </Step>

              {/* STEP 4 — settle */}
              <Step n={4} title="Settle & pay winners">
                {!allDone ? (
                  <p className="text-sm text-mist">Available once every match has a final score (or is marked postponed).</p>
                ) : (
                  <div className="space-y-4">
                    {previewTotals && (
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl bg-ink/60 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-mist">Pool</p><p className="text-xl font-extrabold">{etbLabel(previewTotals.pool)}</p></div>
                        <div className="rounded-2xl bg-ink/60 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-mist">To winners</p><p className="text-xl font-extrabold text-lilac-soft">{etbLabel(previewTotals.prize)}</p></div>
                        <div className="rounded-2xl bg-ink/60 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-mist">House</p><p className="text-xl font-extrabold">{etbLabel(previewTotals.house)}</p></div>
                      </div>
                    )}
                    <div className="rounded-2xl border border-lilac/20 bg-lilac/10 p-4">
                      <p className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-lilac"><TrophyIcon size={14} /> Preview payouts</p>
                      {preview.length === 0 ? (
                        <p className="text-sm text-mist">No payouts (no players in this round).</p>
                      ) : (
                        <ul className="space-y-1 text-sm">
                          {preview.map((p) => (
                            <li key={p.username} className="flex justify-between"><span className="font-bold">{p.username}</span><span>{formatUnits(p.units)}</span></li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <form action={settle}>
                      <input type="hidden" name="roundId" value={round.id} />
                      <SubmitButton className={primaryButtonClass} confirm={`Settle ${round.name} and pay the winners? This cannot be undone.`}>
                        Settle round & pay winners
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </Step>
            </>
          )}
          {round && (
            <section className={card}>
              <div className="mb-4 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-extrabold">Slips placed</h2>
                <p className="text-xs text-mist">
                  {slipCalc?.slips.length ?? 0} slips · {slipsPerPlayer.size} players
                </p>
              </div>
              {(slipCalc?.slips.length ?? 0) === 0 ? (
                <p className="text-sm text-mist">No slips yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-mist/70">
                        <th className="py-2.5 pr-3">Player</th>
                        <th className="py-2.5 pr-3">Phone</th>
                        <th className="py-2.5 pr-3">Slip</th>
                        <th className="py-2.5 pr-3">Placed</th>
                        <th className="py-2.5 text-right">Points</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {slipCalc!.slips.map((sl) => {
                        const st = slipCalc!.result.standings.find((x) => x.userId === String(sl.id));
                        return (
                          <tr key={sl.id}>
                            <td className="py-2.5 pr-3 font-bold">
                              <Link href={`/admin/players/${sl.user_id}`} className="hover:text-lilac">{sl.username}</Link>
                            </td>
                            <td className="py-2.5 pr-3 text-mist">{sl.phone ?? "—"}</td>
                            <td className="py-2.5 pr-3">
                              #{sl.slip_no}
                              {(slipsPerPlayer.get(sl.user_id) ?? 0) > 1 && <span className="ml-1 text-xs text-mist">of {slipsPerPlayer.get(sl.user_id)}</span>}
                            </td>
                            <td className="py-2.5 pr-3 text-xs text-mist">{formatKickoff(sl.created_at)}</td>
                            <td className="py-2.5 text-right font-bold">{st ? st.totalPoints : 0}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Side column */}
        <div className="space-y-5">
          {round && (
            <section className={card}>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Active round</p>
              <p className="mt-1 text-2xl font-extrabold">{round.name}</p>
              <span className="mt-2 inline-block rounded-full bg-white/10 px-3 py-1 text-xs font-bold uppercase">{round.status}</span>
              {pool && (
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between"><dt className="text-mist">Slips</dt><dd className="font-bold">{pool.entrants}</dd></div>
                  <div className="flex justify-between"><dt className="text-mist">Players</dt><dd className="font-bold">{pool.players}</dd></div>
                  <div className="flex justify-between"><dt className="text-mist">Entry</dt><dd className="font-bold">{formatUnits(Number(round.entry_fee_units))}</dd></div>
                  <div className="flex justify-between"><dt className="text-mist">Pool</dt><dd className="font-bold">{etbLabel(pool.pool_units)}</dd></div>
                  <div className="flex justify-between"><dt className="text-mist">Prize (70%)</dt><dd className="font-bold text-lilac-soft">{etbLabel(pool.prize_fund_units)}</dd></div>
                </dl>
              )}
              <form action={setRoundStatus} className="mt-5">
                <input type="hidden" name="roundId" value={round.id} />
                <input type="hidden" name="status" value={round.status === "open" ? "locked" : "open"} />
                <SubmitButton className={`${secondaryButtonClass} w-full`}>
                  {round.status === "open" ? "Lock round (stop new entries)" : round.status === "draft" ? "Open round (needs 10 matches)" : "Reopen round"}
                </SubmitButton>
              </form>
            </section>
          )}

          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Recent rounds</h2>
            {recent.length === 0 ? (
              <p className="text-sm text-mist">No rounds yet.</p>
            ) : (
              <ul className="divide-y divide-white/5 text-sm">
                {recent.map((r) => (
                  <li key={r.id} className="flex items-center justify-between py-2.5">
                    <span className="font-semibold">{r.name}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${r.status === "settled" ? "bg-emerald-300/15 text-emerald-100" : "bg-white/10 text-mist"}`}>{r.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/leaderboard" className="mt-4 inline-block text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">View leaderboard →</Link>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
