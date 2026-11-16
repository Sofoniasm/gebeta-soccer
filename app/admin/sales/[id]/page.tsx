import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUnits } from "@/lib/money";
import { formatKickoff } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { inviteLink, playerMoney, referralLookalikes, type GameInfo, type MoneyRow } from "@/lib/referrals";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Salesperson · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
const th = "px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-mist";
const td = "px-2 py-2 align-top";
const u = (n: number) => formatUnits(Math.round(n * 100) / 100);

const KIND: Record<string, string> = {
  deposit: "Deposit",
  entry_fee: "Stake",
  payout: "Winnings",
  withdrawal: "Withdrawal",
  refund: "Refund",
  adjustment: "Adjustment",
  subscription: "Premium",
  commission: "Commission",
};

interface Person { id: string; username: string; phone_number: string | null; balance_units: number; referral_code?: string | null; referral_ip: string | null; referred_at?: string | null }
interface LedgerRow extends MoneyRow { id: number; reference: string | null; created_at: string }
interface Earning { id: number; player_id: string; round_id: number | null; challenge_id: number | null; stake_units: number; house_pct: number; share_pct: number; amount_units: number; ledger_id: number | null; label: string | null; created_at: string }
interface W { id: number; user_id: string; units: number; payout_phone: string; status: string; admin_note: string | null; created_at: string; processed_at: string | null }

/** Supabase `.in()` with many ids: ask in chunks. */
async function inChunks<T>(ids: (string | number)[], run: (chunk: (string | number)[]) => PromiseLike<{ data: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 150) out.push(...(((await run(ids.slice(i, i + 150))).data ?? []) as T[]));
  return out;
}

export default async function SalespersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdminId(`/admin/sales/${id}`);
  const admin = createAdminClient();

  const { data: sp } = await admin.from("profiles").select("id, username, phone_number, balance_units, referral_code, referral_ip").eq("id", id).maybeSingle();
  if (!sp) notFound();
  const s = sp as Person;

  const [{ data: refData }, { data: earnData }, { data: ownLedger }] = await Promise.all([
    admin.from("profiles").select("id, username, phone_number, balance_units, referral_ip, referred_at").eq("referred_by", id).order("referred_at", { ascending: false }).limit(5000),
    admin.from("referral_earnings").select("*").eq("salesperson_id", id).order("created_at", { ascending: false }).limit(5000),
    admin.from("wallet_ledger").select("id, user_id, kind, amount_units, round_id, challenge_id, league_id, reference, created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(500),
  ]);
  const players = (refData ?? []) as Person[];
  const earnings = ((earnData ?? []) as Earning[]).map((e) => ({ ...e, stake_units: Number(e.stake_units), house_pct: Number(e.house_pct), share_pct: Number(e.share_pct), amount_units: Number(e.amount_units) }));
  const pIds = players.map((p) => p.id);

  // Every transaction of the invited players, plus withdrawals of everyone involved.
  const [ledger, withdrawals] = await Promise.all([
    inChunks<LedgerRow>(pIds, (c) =>
      admin.from("wallet_ledger").select("id, user_id, kind, amount_units, round_id, challenge_id, league_id, reference, created_at").in("user_id", c).order("created_at", { ascending: false }).limit(20000),
    ),
    inChunks<W>([id, ...pIds], (c) =>
      admin.from("withdrawal_requests").select("id, user_id, units, payout_phone, status, admin_note, created_at, processed_at").in("user_id", c).order("created_at", { ascending: false }).limit(5000),
    ),
  ]);
  ledger.sort((a, b) => b.created_at.localeCompare(a.created_at));

  // Settled games and their house cut / fee, to work out the house's share.
  const roundIds = [...new Set(ledger.map((l) => l.round_id).filter((x): x is number => !!x))];
  const chIds = [...new Set(ledger.map((l) => l.challenge_id).filter((x): x is number => !!x))];
  const [roundRows, chRows] = await Promise.all([
    inChunks<{ id: number; name: string | null; house_cut: number; status: string }>(roundIds, (c) => admin.from("rounds").select("id, name, house_cut, status").in("id", c)),
    inChunks<{ id: number; code: string; fee_pct: number; status: string }>(chIds, (c) => admin.from("challenges").select("id, code, fee_pct, status").in("id", c)),
  ]);
  const rounds = new Map<number, GameInfo>(roundRows.map((r) => [r.id, { pct: Number(r.house_cut), settled: r.status === "settled" }]));
  const challenges = new Map<number, GameInfo>(chRows.map((c) => [c.id, { pct: Number(c.fee_pct), settled: c.status === "settled" }]));
  const roundName = new Map(roundRows.map((r) => [r.id, r.name?.trim() || `Round ${r.id}`]));
  const chName = new Map(chRows.map((c) => [c.id, `Challenge ${c.code}`]));
  const gameName = (l: { round_id: number | null; challenge_id: number | null; league_id: number | null }) =>
    l.challenge_id ? chName.get(l.challenge_id) ?? `Challenge #${l.challenge_id}` : l.league_id ? `League #${l.league_id}` : l.round_id ? roundName.get(l.round_id) ?? `Round ${l.round_id}` : "";

  const money = playerMoney(ledger, rounds, challenges);
  const empty = { deposited: 0, staked: 0, refunded: 0, won: 0, withdrawn: 0, houseCut: 0 };
  const commissionFrom = new Map<string, number>();
  for (const e of earnings) commissionFrom.set(e.player_id, Math.round(((commissionFrom.get(e.player_id) ?? 0) + e.amount_units) * 100) / 100);
  const nameOf = new Map(players.map((p) => [p.id, p.username]));

  const sum = (f: (m: typeof empty) => number) => players.reduce((a, p) => a + f(money.get(p.id) ?? empty), 0);
  const totalCommission = earnings.reduce((a, e) => a + e.amount_units, 0);
  const houseCut = sum((m) => m.houseCut);
  const ownW = withdrawals.filter((w) => w.user_id === id);
  const paidOut = ownW.filter((w) => w.status === "paid").reduce((a, w) => a + Number(w.units), 0);
  const pendingOut = ownW.filter((w) => w.status === "pending").reduce((a, w) => a + Number(w.units), 0);

  // Fraud: invited players that look like the salesperson (logins = IPs of the last 90 days).
  const keyOwner = new Map<string, string>();
  for (const p of [s, ...players]) {
    keyOwner.set(p.username.toLowerCase(), p.id);
    const ph = p.phone_number ? normalizeEthiopianPhone(p.phone_number) ?? p.phone_number : null;
    if (ph) keyOwner.set(ph, p.id);
  }
  const loginRows = await inChunks<{ login_key: string; ip: string }>([...keyOwner.keys()], (c) =>
    admin.from("login_attempts").select("login_key, ip").eq("success", true).gte("created_at", new Date(Date.now() - 90 * 86_400_000).toISOString()).in("login_key", c as string[]).limit(20000),
  );
  const flags = referralLookalikes({
    salesperson: s,
    referred: players,
    withdrawals,
    logins: loginRows.map((l) => ({ user_id: keyOwner.get(l.login_key) ?? "", ip: l.ip })).filter((l) => l.user_id),
  });
  const flagOf = new Map(flags.map((f) => [f.playerId, f.reasons]));

  const tiles: [string, string, string?][] = [
    ["Players invited", String(players.length)],
    ["Their deposits", u(sum((m) => m.deposited))],
    ["Their stakes (after refunds)", u(sum((m) => m.staked))],
    ["Their winnings", u(sum((m) => m.won))],
    ["House cut from them", u(houseCut), "settled rounds & challenges"],
    ["Commission paid", u(totalCommission), "5% rounds · 2% challenges"],
    ["House keeps", u(houseCut - totalCommission), "house cut − commission"],
    ["Salesperson balance", u(Number(s.balance_units)), `paid out ${u(paidOut)} · waiting ${u(pendingOut)}`],
  ];

  return (
    <AppShell next={`/admin/sales/${id}`}>
      <Link href="/admin/sales" className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">← Sales & Referrals</Link>

      <section className="mb-5 rounded-[2rem] border border-white/5 bg-gradient-to-br from-[#3a3166] via-card to-ink p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-extrabold">
              {s.username}{" "}
              {s.referral_code ? (
                <span className="ml-1 rounded-full bg-lilac/15 px-3 py-1 align-middle text-sm font-extrabold tracking-wider text-lilac-soft">{s.referral_code}</span>
              ) : (
                <span className="ml-1 rounded-full bg-white/10 px-3 py-1 align-middle text-xs font-bold text-mist">code removed</span>
              )}
            </h1>
            <p className="text-sm text-mist">
              {s.phone_number ?? "no phone"}
              {s.referral_code && <> · {inviteLink(SITE_URL, s.referral_code)}</>}
            </p>
          </div>
          <Link href={`/admin/players/${s.id}`} className="text-xs font-bold uppercase tracking-wider text-lilac">Player page →</Link>
        </div>
      </section>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="rounded-2xl border border-white/5 bg-card/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-lilac">{label}</p>
            <p className="mt-1 text-base font-extrabold">{value}</p>
            {sub && <p className="text-[11px] text-mist">{sub}</p>}
          </div>
        ))}
      </div>

      {flags.length > 0 && (
        <section className="mb-5 rounded-[2rem] border border-rose-300/30 bg-rose-400/10 p-5 text-sm text-rose-50">
          <p className="font-bold">⚠️ Check before paying: {flags.length} invited player{flags.length === 1 ? "" : "s"} look like the salesperson</p>
          <ul className="mt-2 space-y-1 text-xs">
            {flags.map((f) => (
              <li key={f.playerId}><Link href={`/admin/players/${f.playerId}`} className="font-bold underline">{f.username}</Link>: {f.reasons.join("; ")}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Withdrawals of the salesperson = how commission is paid out */}
      <section className={`${card} mb-5`}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-extrabold">Payouts to the salesperson (withdrawals)</h2>
          <Link href="/admin/players" className="text-xs font-bold uppercase tracking-wider text-lilac">Approve on Players →</Link>
        </div>
        {ownW.length === 0 ? <p className="text-sm text-mist">No withdrawals yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><th className={th}>#</th><th className={th}>Asked</th><th className={th}>Amount</th><th className={th}>To</th><th className={th}>Status</th><th className={th}>Note</th></tr></thead>
              <tbody>
                {ownW.map((w) => (
                  <tr key={w.id} className="border-t border-white/5">
                    <td className={td}>{w.id}</td>
                    <td className={td}>{formatKickoff(w.created_at)}</td>
                    <td className={`${td} font-bold`}>{u(Number(w.units))}</td>
                    <td className={td}>{w.payout_phone}</td>
                    <td className={td}>{w.status}{w.processed_at ? ` · ${formatKickoff(w.processed_at)}` : ""}</td>
                    <td className={`${td} text-mist`}>{w.admin_note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Invited players */}
      <section className={`${card} mb-5`}>
        <h2 className="mb-3 text-lg font-extrabold">Invited players ({players.length})</h2>
        {players.length === 0 ? <p className="text-sm text-mist">Nobody signed up with this code yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className={th}>Player</th><th className={th}>Joined</th><th className={th}>Deposited</th><th className={th}>Staked</th>
                  <th className={th}>Won</th><th className={th}>Withdrawn</th><th className={th}>House cut</th><th className={th}>Commission</th><th className={th}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const m = money.get(p.id) ?? empty;
                  return (
                    <tr key={p.id} className={`border-t border-white/5 ${flagOf.has(p.id) ? "bg-rose-400/10" : ""}`}>
                      <td className={td}>
                        <Link href={`/admin/players/${p.id}`} className="font-bold hover:text-lilac">{p.username}</Link>
                        {flagOf.has(p.id) && <span className="ml-1" title={flagOf.get(p.id)!.join("; ")}>⚠️</span>}
                        <p className="text-[11px] text-mist">{p.phone_number ?? "no phone"}</p>
                      </td>
                      <td className={td}>{p.referred_at ? formatKickoff(p.referred_at) : "—"}</td>
                      <td className={td}>{u(m.deposited)}</td>
                      <td className={td}>{u(m.staked)}{m.refunded ? <p className="text-[11px] text-mist">refunded {u(m.refunded)}</p> : null}</td>
                      <td className={td}>{u(m.won)}</td>
                      <td className={td}>{u(m.withdrawn)}</td>
                      <td className={td}>{u(m.houseCut)}</td>
                      <td className={`${td} font-bold text-emerald-200`}>{u(commissionFrom.get(p.id) ?? 0)}</td>
                      <td className={td}>{u(Number(p.balance_units))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Every commission, with the maths */}
      <section className={`${card} mb-5`}>
        <h2 className="mb-1 text-lg font-extrabold">Commission ledger ({earnings.length})</h2>
        <p className="mb-3 text-xs text-mist">Commission = stake × house cut × share, rounded down to 0.01. Paid when the game is settled. Under 0.01 is not paid.</p>
        {earnings.length === 0 ? <p className="text-sm text-mist">No commission yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr><th className={th}>Paid</th><th className={th}>Game</th><th className={th}>Player</th><th className={th}>Stake</th><th className={th}>House cut</th><th className={th}>Share</th><th className={th}>Commission</th><th className={th}>Ledger #</th></tr>
              </thead>
              <tbody>
                {earnings.map((e) => (
                  <tr key={e.id} className="border-t border-white/5">
                    <td className={td}>{formatKickoff(e.created_at)}</td>
                    <td className={td}>{e.label ?? gameName({ round_id: e.round_id, challenge_id: e.challenge_id, league_id: null })}</td>
                    <td className={td}>{nameOf.get(e.player_id) ?? "?"}</td>
                    <td className={td}>{u(e.stake_units)}</td>
                    <td className={td}>{Math.round(e.house_pct * 100)}% = {u(e.stake_units * e.house_pct)}</td>
                    <td className={td}>{Math.round(e.share_pct * 1000) / 10}%</td>
                    <td className={`${td} font-bold text-emerald-200`}>+{u(e.amount_units)}</td>
                    <td className={`${td} text-mist`}>{e.ledger_id ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Salesperson's own wallet */}
      <section className={`${card} mb-5`}>
        <h2 className="mb-3 text-lg font-extrabold">Salesperson&apos;s wallet (all transactions)</h2>
        <LedgerTable rows={(ownLedger ?? []) as LedgerRow[]} gameName={gameName} />
      </section>

      {/* Invited players' transactions */}
      <section className={card}>
        <h2 className="mb-1 text-lg font-extrabold">Invited players&apos; transactions</h2>
        <p className="mb-3 text-xs text-mist">Newest 300 of {ledger.length}. Open a player for their full history.</p>
        <LedgerTable rows={ledger.slice(0, 300)} gameName={gameName} who={nameOf} />
      </section>
    </AppShell>
  );
}

function LedgerTable({ rows, gameName, who }: { rows: LedgerRow[]; gameName: (l: LedgerRow) => string; who?: Map<string, string> }) {
  if (rows.length === 0) return <p className="text-sm text-mist">No transactions.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr><th className={th}>#</th><th className={th}>When</th>{who && <th className={th}>Player</th>}<th className={th}>Type</th><th className={th}>Game</th><th className={th}>Amount</th><th className={th}>Note</th></tr>
        </thead>
        <tbody>
          {rows.map((l) => {
            const a = Number(l.amount_units);
            return (
              <tr key={l.id} className="border-t border-white/5">
                <td className={`${td} text-mist`}>{l.id}</td>
                <td className={td}>{formatKickoff(l.created_at)}</td>
                {who && <td className={td}>{who.get(l.user_id) ?? "?"}</td>}
                <td className={td}>{KIND[l.kind] ?? l.kind}</td>
                <td className={td}>{gameName(l)}</td>
                <td className={`${td} font-bold ${a > 0 ? "text-emerald-200" : "text-rose-200"}`}>{a > 0 ? "+" : "−"}{u(Math.abs(a))}</td>
                <td className={`${td} text-xs text-mist`}>{l.reference ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
