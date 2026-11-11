import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { etbLabel, unitsLabel } from "@/lib/money";
import { formatKickoff } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Banner, secondaryButtonClass } from "@/components/ui";
import { SubmitButton } from "../SubmitButton";
import { approveLeagueMember, rejectLeagueMember, settleLeagueNow } from "../actions";

export const metadata = { title: "Leagues · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface League {
  id: number;
  code: string;
  name: string;
  captain_id: string;
  round_id: number;
  entry_fee_units: number;
  status: string;
  created_at: string;
  rounds: { name: string; status: string } | null;
}
interface Member {
  league_id: number;
  user_id: string;
  status: string;
  requested_at: string;
}
interface Player {
  id: string;
  username: string;
  phone_number: string | null;
  balance_units: number;
}

export default async function AdminLeaguesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdminId("/admin/leagues");
  const { msg, err } = await searchParams;
  const admin = createAdminClient();

  const [{ data: leaguesData }, { data: membersData }, { data: matchesData }] = await Promise.all([
    admin.from("leagues").select("*, rounds(name, status)").order("id", { ascending: false }).limit(200),
    admin.from("league_members").select("league_id, user_id, status, requested_at").in("status", ["pending", "active"]),
    admin.from("matches").select("round_id, status").not("round_id", "is", null),
  ]);
  const leagues = (leaguesData ?? []) as League[];
  const members = (membersData ?? []) as Member[];
  const ids = [...new Set([...members.map((m) => m.user_id), ...leagues.map((l) => l.captain_id)])];
  const { data: playersData } = ids.length
    ? await admin.from("profiles").select("id, username, phone_number, balance_units").in("id", ids)
    : { data: [] };
  const player = new Map(((playersData ?? []) as Player[]).map((p) => [p.id, { ...p, balance_units: Number(p.balance_units) }]));
  const leagueById = new Map(leagues.map((l) => [l.id, l]));

  const roundDone = new Map<number, boolean>();
  for (const m of (matchesData ?? []) as { round_id: number; status: string }[]) {
    const done = ["finished", "cancelled", "postponed"].includes(m.status);
    roundDone.set(m.round_id, (roundDone.get(m.round_id) ?? true) && done);
  }

  const pending = members
    .filter((m) => m.status === "pending" && leagueById.get(m.league_id)?.status === "open")
    .sort((a, b) => a.requested_at.localeCompare(b.requested_at));
  const activeCount = (id: number) => members.filter((m) => m.league_id === id && m.status === "active").length;
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  return (
    <AppShell title="Private leagues" next="/admin/leagues">
      {msg && <div className="mb-4"><Banner kind="success">{msg}</Banner></div>}
      {err && <div className="mb-4"><Banner kind="error">{err}</Banner></div>}

      {/* Pending payments */}
      <section className={`${card} mb-5`}>
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-extrabold">Waiting for payment</h2>
          <p className="text-xs text-mist">
            Player paid on Telegram → <b className="text-white">Received ETB</b>. Player already has units → <b className="text-white">Take from wallet</b>.
          </p>
        </div>
        {pending.length === 0 ? (
          <p className="py-4 text-center text-sm text-mist">No join requests waiting.</p>
        ) : (
          <div className="space-y-3">
            {pending.map((m) => {
              const l = leagueById.get(m.league_id)!;
              const p = player.get(m.user_id);
              const fee = Number(l.entry_fee_units);
              const canWallet = (p?.balance_units ?? 0) >= fee;
              return (
                <div key={`${m.league_id}-${m.user_id}`} className="rounded-2xl border border-amber-200/20 bg-amber-200/5 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold">
                        {p?.username ?? "?"} <span className="text-xs font-normal text-mist">{p?.phone_number ?? ""}</span>
                      </p>
                      <p className="text-xs text-mist">
                        wants to join <b className="text-white">{l.name}</b> ({l.code}) · {formatKickoff(m.requested_at)} · wallet{" "}
                        {unitsLabel(p?.balance_units ?? 0)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Owes</p>
                      <p className="font-extrabold text-amber-100">{etbLabel(fee)}</p>
                      <p className="text-xs text-mist">{unitsLabel(fee)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <form action={approveLeagueMember}>
                      <input type="hidden" name="leagueId" value={l.id} />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <input type="hidden" name="mode" value="add" />
                      <SubmitButton
                        className="rounded-full bg-lilac px-4 py-2 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft"
                        confirm={`Received ${etbLabel(fee)} from ${p?.username}? Add ${unitsLabel(fee)} and approve.`}
                      >
                        Received ETB: add &amp; approve
                      </SubmitButton>
                    </form>
                    <form action={approveLeagueMember}>
                      <input type="hidden" name="leagueId" value={l.id} />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <input type="hidden" name="mode" value="wallet" />
                      {canWallet ? (
                        <SubmitButton className={secondaryButtonClass} confirm={`Take ${unitsLabel(fee)} from ${p?.username}'s wallet and approve?`}>
                          Take from wallet &amp; approve
                        </SubmitButton>
                      ) : (
                        <span className="inline-block px-2 py-2 text-xs text-mist">Wallet too low for “take from wallet”</span>
                      )}
                    </form>
                    <form action={rejectLeagueMember}>
                      <input type="hidden" name="leagueId" value={l.id} />
                      <input type="hidden" name="userId" value={m.user_id} />
                      <SubmitButton className="px-2 py-2 text-xs font-bold text-rose-300 hover:text-rose-200" confirm="Decline this request?">
                        Decline
                      </SubmitButton>
                    </form>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* All leagues */}
      <section className={card}>
        <h2 className="mb-4 text-lg font-extrabold">All leagues</h2>
        {leagues.length === 0 ? (
          <p className="py-4 text-center text-sm text-mist">No leagues yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-mist/70">
                  <th className="py-3 pr-3">League</th>
                  <th className="py-3 pr-3">Captain</th>
                  <th className="py-3 pr-3">Round</th>
                  <th className="py-3 pr-3 text-right">Entry</th>
                  <th className="py-3 pr-3 text-right">Players</th>
                  <th className="py-3 pr-3 text-right">Pot · prize</th>
                  <th className="py-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {leagues.map((l) => {
                  const fee = Number(l.entry_fee_units);
                  const n = activeCount(l.id);
                  const ready = l.status === "open" && roundDone.get(l.round_id) === true;
                  return (
                    <tr key={l.id} className="align-top">
                      <td className="py-3 pr-3">
                        <Link href={`/leagues/${l.code}`} className="font-bold hover:text-lilac">{l.name}</Link>
                        <p className="text-xs text-mist">{l.code}</p>
                      </td>
                      <td className="py-3 pr-3">{player.get(l.captain_id)?.username ?? "—"}</td>
                      <td className="py-3 pr-3 text-mist">{l.rounds?.name ?? "—"}</td>
                      <td className="py-3 pr-3 text-right">{fee > 0 ? etbLabel(fee) : "Free"}</td>
                      <td className="py-3 pr-3 text-right">{n}</td>
                      <td className="py-3 pr-3 text-right">
                        {fee > 0 ? (
                          <>
                            <p className="font-bold">{etbLabel(n * fee)}</p>
                            <p className="text-xs text-emerald-200">{etbLabel(Math.round(n * fee * 0.7 * 100) / 100)}</p>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-3 text-right">
                        {ready ? (
                          <form action={settleLeagueNow}>
                            <input type="hidden" name="leagueId" value={l.id} />
                            <SubmitButton
                              className="rounded-full bg-lilac px-3 py-1.5 text-xs font-bold uppercase text-ink hover:bg-lilac-soft"
                              confirm={`Settle ${l.name} and pay the winner?`}
                            >
                              Settle
                            </SubmitButton>
                          </form>
                        ) : (
                          <span
                            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                              l.status === "settled" ? "bg-emerald-300/15 text-emerald-100" : "bg-white/10 text-mist"
                            }`}
                          >
                            {l.status === "settled" ? "Settled" : "Playing"}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-xs text-mist">Leagues are settled automatically when you settle their round. Use “Settle” only if one was missed.</p>
      </section>
    </AppShell>
  );
}
