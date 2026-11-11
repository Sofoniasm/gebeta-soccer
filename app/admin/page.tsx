import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRoundPool, type MatchRow, type RoundRow } from "@/lib/rounds";
import { formatKickoff, formatEtb } from "@/lib/format";
import { formatUnits, unitsToEtb } from "@/lib/money";
import { addUnits, assignMatches, createRound, removeMatch, setRoundStatus, setScore, settle, syncNow } from "./actions";
import { Banner, Card, Logo, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { RefreshIcon } from "@/components/icons";
import { SubmitButton } from "./SubmitButton";

export const metadata = { title: "Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const small = "rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white outline-none focus:border-amber-400";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ msg?: string; err?: string; q?: string }>;
}) {
  // ---- auth: admins only
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) redirect("/dashboard");

  const { msg, err, q } = await searchParams;
  const admin = createAdminClient();

  // ---- user search
  let users: { id: string; username: string; email: string | null; phone_number: string | null; balance_units: number }[] = [];
  if (q && q.trim()) {
    const term = q.trim().replace(/[%,()]/g, "");
    const digits = term.replace(/\D/g, "");
    const filters = [`username.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 4) filters.push(`phone_number.ilike.%${digits.slice(-9)}%`);
    const { data } = await admin
      .from("profiles")
      .select("id, username, email, phone_number, balance_units")
      .or(filters.join(","))
      .limit(20);
    users = data ?? [];
  }

  // ---- active round
  const { data: activeRound } = await admin
    .from("rounds")
    .select("*")
    .in("status", ["open", "locked"])
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const round = activeRound as RoundRow | null;

  const roundMatches: MatchRow[] = round
    ? (((await admin.from("matches").select("*").eq("round_id", round.id).order("kickoff_at")).data ?? []) as MatchRow[])
    : [];
  const pool = round ? await getRoundPool(admin, round.id) : null;

  const { data: upcoming } = await admin
    .from("matches")
    .select("*")
    .is("round_id", null)
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString())
    .order("kickoff_at")
    .limit(60);

  const { data: recentRounds } = await admin.from("rounds").select("*").order("id", { ascending: false }).limit(5);

  return (
    <main className="mx-auto min-h-dvh max-w-2xl space-y-5 px-4 py-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo />
          <span className="rounded-full bg-amber-400/15 px-2.5 py-0.5 text-xs font-bold text-amber-300">ADMIN</span>
        </div>
        <Link href="/dashboard" className="text-sm text-neutral-400 hover:text-white">Dashboard →</Link>
      </header>

      {msg && <Banner kind="success">{msg}</Banner>}
      {err && <Banner kind="error">{err}</Banner>}

      {/* -------------------------------------------- users & deposits */}
      <Card className="space-y-4">
        <h2 className="text-lg font-bold">Players & deposits</h2>
        <form className="flex gap-2">
          <input name="q" defaultValue={q ?? ""} placeholder="Phone, username or email" className={inputClass} />
          <button className={secondaryButtonClass}>Search</button>
        </form>

        {q && users.length === 0 && <p className="text-sm text-neutral-400">No players found.</p>}

        <div className="space-y-3">
          {users.map((u) => (
            <div key={u.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-semibold">{u.username}</p>
                <p className="text-sm text-emerald-300">{formatUnits(Number(u.balance_units))}</p>
              </div>
              <p className="text-xs text-neutral-400">{u.phone_number ?? "no phone"} · {u.email ?? "no email"}</p>
              <form action={addUnits} className="mt-3 flex flex-wrap gap-2">
                <input type="hidden" name="userId" value={u.id} />
                <input type="hidden" name="q" value={q ?? ""} />
                <input name="units" type="number" step="0.5" min="0.5" defaultValue="1" className={`${small} w-20`} aria-label="Units" />
                <input name="reference" required placeholder="Telebirr txn ID" className={`${small} min-w-0 flex-1`} />
                <SubmitButton className={secondaryButtonClass}>Add units</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </Card>

      {/* -------------------------------------------------- round */}
      <Card className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Current round</h2>
          <form action={syncNow}>
            <SubmitButton className={secondaryButtonClass}>
              <RefreshIcon size={16} /> Sync matches
            </SubmitButton>
          </form>
        </div>

        {!round ? (
          <form action={createRound} className="space-y-3">
            <p className="text-sm text-neutral-400">No open round. Create one:</p>
            <div className="flex gap-2">
              <input name="name" required placeholder="Week 1" className={inputClass} />
              <input name="entryFee" type="number" step="0.5" min="0.5" defaultValue="1" className={`${inputClass} w-24`} aria-label="Entry fee (units)" />
            </div>
            <SubmitButton className={primaryButtonClass}>Create & open round</SubmitButton>
          </form>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/20 p-3">
              <div>
                <p className="font-semibold">{round.name} <span className="ml-1 rounded-full bg-white/10 px-2 py-0.5 text-xs uppercase">{round.status}</span></p>
                {pool && (
                  <p className="text-xs text-neutral-400">
                    {pool.entrants} players · pool {formatEtb(unitsToEtb(pool.pool_units))} · prizes {formatEtb(unitsToEtb(pool.prize_fund_units))}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <form action={setRoundStatus}>
                  <input type="hidden" name="roundId" value={round.id} />
                  <input type="hidden" name="status" value={round.status === "open" ? "locked" : "open"} />
                  <SubmitButton className={secondaryButtonClass}>{round.status === "open" ? "Lock" : "Reopen"}</SubmitButton>
                </form>
                <form action={settle}>
                  <input type="hidden" name="roundId" value={round.id} />
                  <SubmitButton className={`${secondaryButtonClass} border-amber-400/40 text-amber-200`} confirm="Settle this round and pay winners? This cannot be undone.">
                    Settle round
                  </SubmitButton>
                </form>
              </div>
            </div>

            {/* Round matches + manual scores */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-neutral-300">Matches in round ({roundMatches.length})</p>
              {roundMatches.length === 0 && <p className="text-sm text-neutral-500">None yet — add some below.</p>}
              {roundMatches.map((m) => (
                <div key={m.id} className="rounded-xl border border-white/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{m.home_team} vs {m.away_team}</p>
                    <span className="text-xs text-neutral-400">{m.status}</span>
                  </div>
                  <p className="text-xs text-neutral-500">{formatKickoff(m.kickoff_at)} · {m.competition}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <form action={setScore} className="flex items-center gap-1.5">
                      <input type="hidden" name="matchId" value={m.id} />
                      <input type="hidden" name="status" value="finished" />
                      <input name="home" type="number" min="0" defaultValue={m.actual_home_score ?? ""} className={`${small} w-14 text-center`} aria-label="Home score" />
                      <span className="text-neutral-500">–</span>
                      <input name="away" type="number" min="0" defaultValue={m.actual_away_score ?? ""} className={`${small} w-14 text-center`} aria-label="Away score" />
                      <SubmitButton className={secondaryButtonClass}>Save score</SubmitButton>
                    </form>
                    <form action={setScore}>
                      <input type="hidden" name="matchId" value={m.id} />
                      <input type="hidden" name="status" value="postponed" />
                      <SubmitButton className="text-xs text-neutral-400 hover:text-white">Postponed</SubmitButton>
                    </form>
                    <form action={removeMatch}>
                      <input type="hidden" name="matchId" value={m.id} />
                      <SubmitButton className="text-xs text-red-300 hover:text-red-200">Remove</SubmitButton>
                    </form>
                  </div>
                </div>
              ))}
            </div>

            {/* Add upcoming matches */}
            <form action={assignMatches} className="space-y-2">
              <input type="hidden" name="roundId" value={round.id} />
              <p className="text-sm font-semibold text-neutral-300">Add upcoming matches</p>
              {(upcoming ?? []).length === 0 && (
                <p className="text-sm text-neutral-500">No upcoming matches. Press “Sync matches” first.</p>
              )}
              <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
                {(upcoming ?? []).map((m: MatchRow) => (
                  <label key={m.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/5">
                    <input type="checkbox" name="matchId" value={m.id} className="h-4 w-4 accent-amber-400" />
                    <span className="flex-1 text-sm">{m.home_team} vs {m.away_team}</span>
                    <span className="text-xs text-neutral-500">{formatKickoff(m.kickoff_at)}</span>
                  </label>
                ))}
              </div>
              {(upcoming ?? []).length > 0 && <SubmitButton className={primaryButtonClass}>Add selected to round</SubmitButton>}
            </form>
          </>
        )}
      </Card>

      {/* ------------------------------------------- recent rounds */}
      <Card>
        <h2 className="mb-2 text-lg font-bold">Recent rounds</h2>
        <ul className="divide-y divide-white/5 text-sm">
          {(recentRounds ?? []).map((r: RoundRow) => (
            <li key={r.id} className="flex justify-between py-2">
              <span>{r.name}</span>
              <span className="text-neutral-400">{r.status}</span>
            </li>
          ))}
          {(recentRounds ?? []).length === 0 && <li className="py-2 text-neutral-500">No rounds yet.</li>}
        </ul>
      </Card>
    </main>
  );
}
