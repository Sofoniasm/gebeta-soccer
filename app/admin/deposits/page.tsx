import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { ETB_PER_UNIT, etbLabel, unitsLabel } from "@/lib/money";
import { AppShell } from "@/components/AppShell";
import { DepositForm } from "./DepositForm";
import { creditCryptoDeposit } from "./actions";
import { SubmitButton } from "../SubmitButton";

export const metadata = { title: "Deposits · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const TZ = "Africa/Addis_Ababa";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short" }).format(d);
const dateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

interface Row {
  id: number;
  amount_units: number;
  kind: string;
  reference: string | null;
  created_at: string;
  created_by: string | null;
  profiles: { username: string; phone_number: string | null } | null;
}

export default async function DepositsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; cmsg?: string }> }) {
  await requireAdminId("/admin/deposits");
  const { q = "", type = "all", cmsg } = await searchParams;
  const admin = createAdminClient();

  // Everything recorded by hand: deposits (+) and manual deductions (−)
  const kinds = type === "deposit" ? ["deposit"] : type === "deduct" ? ["adjustment"] : ["deposit", "adjustment"];
  const { data } = await admin
    .from("wallet_ledger")
    .select("id, amount_units, kind, reference, created_at, created_by, profiles(username, phone_number)")
    .in("kind", kinds)
    .order("created_at", { ascending: false })
    .limit(500);
  let rows = ((data ?? []) as unknown as Row[]);

  const term = q.trim().toLowerCase();
  const digits = term.replace(/\D/g, "").slice(-9);
  if (term) {
    rows = rows.filter(
      (r) =>
        r.profiles?.username.toLowerCase().includes(term) ||
        (digits.length >= 4 && (r.profiles?.phone_number ?? "").includes(digits)) ||
        (r.reference ?? "").toLowerCase().includes(term)
    );
  }

  // Admin names for "recorded by"
  const adminIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))] as string[];
  const { data: admins } = adminIds.length
    ? await admin.from("profiles").select("id, username").in("id", adminIds)
    : { data: [] };
  const adminName = new Map(((admins ?? []) as { id: string; username: string }[]).map((a) => [a.id, a.username]));

  // ---- every player with their own balance and deposits
  const { data: allDeps } = await admin
    .from("wallet_ledger")
    .select("user_id, amount_units, created_at, created_by")
    .eq("kind", "deposit")
    .order("created_at", { ascending: false })
    .limit(5000);
  const { data: players } = await admin
    .from("profiles")
    .select("id, username, phone_number, balance_units, phone_verified_at")
    .order("created_at", { ascending: true })
    .limit(500);
  type Dep = { user_id: string; amount_units: number; created_at: string; created_by: string | null };
  const depsByUser = new Map<string, { total: number; count: number; last?: Dep }>();
  for (const d of (allDeps ?? []) as Dep[]) {
    const e = depsByUser.get(d.user_id) ?? { total: 0, count: 0 };
    e.total += Number(d.amount_units);
    e.count += 1;
    if (!e.last) e.last = d; // list is newest first
    depsByUser.set(d.user_id, e);
  }
  const byIds = [...new Set(((allDeps ?? []) as Dep[]).map((d) => d.created_by).filter(Boolean))] as string[];
  const { data: byAdmins } = byIds.length ? await admin.from("profiles").select("id, username").in("id", byIds) : { data: [] };
  const byName = new Map(((byAdmins ?? []) as { id: string; username: string }[]).map((a) => [a.id, a.username]));
  const playerRows = ((players ?? []) as { id: string; username: string; phone_number: string | null; balance_units: number; phone_verified_at: string | null }[])
    .map((pl) => ({ ...pl, balance: Number(pl.balance_units), dep: depsByUser.get(pl.id) }))
    .sort((a, b) => (b.dep?.last?.created_at ?? "").localeCompare(a.dep?.last?.created_at ?? "") || b.balance - a.balance);

  // ---- summary (deposits only)
  const deposits = ((data ?? []) as unknown as Row[]).filter((r) => r.kind === "deposit");
  const now = new Date();
  const todayKey = dayKey(now);
  const weekAgo = now.getTime() - 7 * 86_400_000;
  const sumUnits = (list: Row[]) => list.reduce((s, r) => s + Number(r.amount_units), 0);
  const today = deposits.filter((r) => dayKey(new Date(r.created_at)) === todayKey);
  const week = deposits.filter((r) => new Date(r.created_at).getTime() >= weekAgo);

  // ---- last 14 days chart
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(now.getTime() - (13 - i) * 86_400_000);
    return { key: dayKey(d), label: dayLabel(d), units: 0 };
  });
  const byKey = new Map(days.map((d) => [d.key, d]));
  for (const r of deposits) {
    const slot = byKey.get(dayKey(new Date(r.created_at)));
    if (slot) slot.units += Number(r.amount_units);
  }
  const max = Math.max(...days.map((d) => d.units), 1);

  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  // ---- crypto (AuraPay) invoices; empty until the 0042 SQL is run
  const { data: cryptoData } = await admin
    .from("crypto_deposits")
    .select("id, units, usd, chain, reference, status, paid_amount, tx_hash, note, created_at, profiles!crypto_deposits_user_id_fkey(username)")
    .neq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(30);
  type Crypto = {
    id: number; units: number; usd: number; chain: string; reference: string | null; status: string;
    paid_amount: number | null; tx_hash: string | null; note: string | null; created_at: string;
    profiles: { username: string } | null;
  };
  const cryptoRows = (cryptoData ?? []) as unknown as Crypto[];
  const needsCheck = cryptoRows.filter((c) => c.status === "paid_not_credited").length;
  const CRYPTO_STYLE: Record<string, string> = {
    pending: "text-mist",
    credited: "text-emerald-200",
    paid_not_credited: "text-amber-200",
    expired: "text-mist/60",
  };

  const tab = (t: string, label: string) => (
    <Link
      href={`/admin/deposits?type=${t}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
      className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider ${type === t ? "bg-lilac text-ink" : "text-mist hover:text-white"}`}
    >
      {label}
    </Link>
  );

  return (
    <AppShell title="Deposits" next="/admin/deposits">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mist">Record Telegram payments (1,000 to 100,000 ETB) and see every player&apos;s own balance. 1 Unit = {ETB_PER_UNIT} ETB.</p>
        <Link href="/admin/players" className="text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">Players →</Link>
      </div>

      {/* Summary */}
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Received today · all players", list: today },
          { label: "Last 7 days · all players", list: week },
          { label: "All time · all players", list: deposits },
        ].map(({ label, list }) => (
          <div key={label} className={card}>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">{label}</p>
            <p className="mt-2 text-3xl font-extrabold">{etbLabel(sumUnits(list))}</p>
            <p className="text-xs text-mist">{unitsLabel(sumUnits(list))} · {list.length} deposit{list.length === 1 ? "" : "s"}</p>
          </div>
        ))}
      </div>

      {/* Crypto deposits (AuraPay) — added automatically */}
      {(cryptoRows.length > 0 || cmsg) && (
        <section className={`${card} mb-5`}>
          <h2 className="mb-1 text-lg font-extrabold">
            Crypto deposits (USDT){needsCheck > 0 && <span className="ml-2 rounded-full bg-amber-300/20 px-2 py-0.5 text-xs text-amber-100">{needsCheck} to check</span>}
          </h2>
          <p className="mb-3 text-xs text-mist">
            Added automatically when AuraPay confirms the payment. &quot;Paid · not added&quot; means the player paid but the Units were not added (reason shown).
            Check the payment in AuraPay, then press Add Units, or refund the player in USDT.
          </p>
          {cmsg && <p className="mb-3 rounded-xl bg-ink/60 px-3 py-2 text-sm text-white">{cmsg}</p>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-mist">
                <tr><th className="py-1.5 pr-3">When</th><th className="pr-3">Player</th><th className="pr-3">Units</th><th className="pr-3">USDT</th><th className="pr-3">Invoice</th><th className="pr-3">Status</th><th /></tr>
              </thead>
              <tbody>
                {cryptoRows.map((c) => (
                  <tr key={c.id} className="border-t border-white/5 align-top">
                    <td className="py-2 pr-3 text-mist">{dateTime(c.created_at)}</td>
                    <td className="pr-3 font-bold">{c.profiles?.username ?? "?"}</td>
                    <td className="pr-3">{c.units}</td>
                    <td className="pr-3">{c.usd} · {c.chain}{c.paid_amount != null && Number(c.paid_amount) !== Number(c.usd) ? ` (paid ${Number(c.paid_amount)})` : ""}</td>
                    <td className="pr-3 font-mono">{c.reference ?? "-"}</td>
                    <td className={`pr-3 font-bold ${CRYPTO_STYLE[c.status] ?? ""}`}>
                      {c.status === "paid_not_credited" ? "Paid · not added" : c.status}
                      {c.note && <span className="block font-normal text-mist">{c.note}</span>}
                    </td>
                    <td className="py-1.5">
                      {c.reference && (c.status === "paid_not_credited" || c.status === "pending" || c.status === "expired") && (
                        <form action={creditCryptoDeposit}>
                          <input type="hidden" name="reference" value={c.reference} />
                          <SubmitButton className="whitespace-nowrap rounded-full border border-white/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/10">Add Units</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,26rem)_1fr]">
        {/* 1. Submit */}
        <section className={card}>
          <h2 className="mb-4 text-lg font-extrabold">Record a deposit</h2>
          <DepositForm />
        </section>

        {/* Every player's own balance */}
        <section className={card}>
          <div className="mb-4 flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-extrabold">Player balances</h2>
            <p className="text-xs text-mist">{playerRows.length} player{playerRows.length === 1 ? "" : "s"} · latest deposit first</p>
          </div>
          {playerRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-mist">No players yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-mist/70">
                    <th className="py-3 pr-3">Player</th>
                    <th className="py-3 pr-3 text-right">Balance</th>
                    <th className="py-3 pr-3 text-right">Deposited</th>
                    <th className="py-3">Last deposit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {playerRows.map((pl) => (
                    <tr key={pl.id} className="align-top hover:bg-white/[0.03]">
                      <td className="py-3 pr-3">
                        <p className="font-bold">
                          <Link href={`/admin/players/${pl.id}`} className="hover:text-lilac">{pl.username}</Link>
                          {!pl.phone_verified_at && <span className="ml-1.5 rounded-full bg-amber-200/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-100">Unverified</span>}
                        </p>
                        <p className="text-xs text-mist">{pl.phone_number ?? "no phone"}</p>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right">
                        <p className="font-extrabold text-lilac-soft">{unitsLabel(pl.balance)}</p>
                        <p className="text-xs text-mist">{etbLabel(pl.balance)}</p>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right">
                        <p className="font-bold">{etbLabel(pl.dep?.total ?? 0)}</p>
                        <p className="text-xs text-mist">{pl.dep?.count ?? 0} deposit{pl.dep?.count === 1 ? "" : "s"}</p>
                      </td>
                      <td className="whitespace-nowrap py-3 text-xs text-mist">
                        {pl.dep?.last ? (
                          <>
                            <p className="font-bold text-emerald-200">+{etbLabel(Number(pl.dep.last.amount_units))}</p>
                            <p>{dateTime(pl.dep.last.created_at)}{pl.dep.last.created_by ? ` · by ${byName.get(pl.dep.last.created_by) ?? "admin"}` : ""}</p>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

        {/* Chart */}
        <section className={`${card} mt-5`}>
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold">Deposits · last 14 days</h2>
            <p className="text-xs text-mist">ETB per day</p>
          </div>
          <div className="flex h-56 items-end gap-1.5 sm:gap-2">
            {days.map((d) => {
              const h = d.units > 0 ? Math.max(6, (d.units / max) * 100) : 2;
              return (
                <div key={d.key} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                  <span className="text-[10px] font-bold text-lilac-soft opacity-0 transition group-hover:opacity-100">
                    {d.units > 0 ? (d.units * ETB_PER_UNIT).toLocaleString("en-US") : ""}
                  </span>
                  <div
                    className={`w-full rounded-t-lg ${d.units > 0 ? "bg-gradient-to-t from-[#6c5fb3] to-lilac" : "bg-white/10"}`}
                    style={{ height: `${h}%` }}
                    title={`${d.label}: ${(d.units * ETB_PER_UNIT).toLocaleString("en-US")} ETB`}
                  />
                  <span className="text-[9px] text-mist">{d.label.split(" ")[0]}</span>
                </div>
              );
            })}
          </div>
        </section>

      {/* 2. List */}
      <section className={`${card} mt-5`}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">All submitted</h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full border border-white/10 bg-ink/60 p-1">
              {tab("all", "All")}
              {tab("deposit", "Deposits")}
              {tab("deduct", "Deductions")}
            </div>
            <form className="flex gap-2">
              <input type="hidden" name="type" value={type} />
              <input name="q" defaultValue={q} placeholder="Search player, phone, note" className="w-52 rounded-full border border-white/10 bg-ink/70 px-4 py-2 text-sm outline-none focus:border-lilac" />
            </form>
          </div>
        </div>

        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist">Nothing recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-white/10 text-left text-[10px] font-bold uppercase tracking-[0.15em] text-mist/70">
                  <th className="py-3 pr-3">Date</th>
                  <th className="py-3 pr-3">Player</th>
                  <th className="py-3 pr-3">Phone</th>
                  <th className="py-3 pr-3 text-right">ETB</th>
                  <th className="py-3 pr-3 text-right">Units</th>
                  <th className="py-3 pr-3">Note</th>
                  <th className="py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rows.map((r) => {
                  const u = Number(r.amount_units);
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.03]">
                      <td className="whitespace-nowrap py-3 pr-3 text-mist">{dateTime(r.created_at)}</td>
                      <td className="py-3 pr-3 font-bold">{r.profiles?.username ?? "—"}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-mist">{r.profiles?.phone_number ?? "—"}</td>
                      <td className={`whitespace-nowrap py-3 pr-3 text-right font-extrabold ${u > 0 ? "text-emerald-200" : "text-rose-200"}`}>
                        {u > 0 ? "+" : "−"}{(Math.abs(u) * ETB_PER_UNIT).toLocaleString("en-US")}
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3 text-right">{u > 0 ? "+" : "−"}{Math.abs(u)}</td>
                      <td className="max-w-[16rem] truncate py-3 pr-3 text-mist">{r.reference ?? ""}</td>
                      <td className="whitespace-nowrap py-3 text-mist">{r.created_by ? adminName.get(r.created_by) ?? "admin" : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
