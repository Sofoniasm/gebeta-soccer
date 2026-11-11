import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { ETB_PER_UNIT, formatUnits, unitsToEtb } from "@/lib/money";
import { formatEtb, formatKickoff } from "@/lib/format";
import { TELEBIRR_NAME, TELEBIRR_NUMBER, TELEGRAM_URL } from "@/lib/config";
import { AppShell } from "@/components/AppShell";
import { DepositForm, WithdrawForm } from "./WalletForms";
import { SendIcon, WalletIcon } from "@/components/icons";

export const metadata = { title: "Wallet · GebetaSoccer" };
export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  entry_fee: "Round entry",
  payout: "Winnings",
  refund: "Refund",
  adjustment: "Adjustment",
};

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-200/15 text-amber-100",
  approved: "bg-emerald-300/15 text-emerald-100",
  paid: "bg-emerald-300/15 text-emerald-100",
  rejected: "bg-rose-400/15 text-rose-100",
};

export default async function WalletPage() {
  const me = await getMe("/wallet");
  const supabase = await createClient();

  const [{ data: ledger }, { data: deposits }, { data: withdrawals }] = await Promise.all([
    supabase.from("wallet_ledger").select("id, amount_units, kind, reference, created_at").eq("user_id", me.id).order("created_at", { ascending: false }).limit(50),
    supabase.from("deposit_requests").select("id, amount_etb, reference, status, admin_note, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("withdrawal_requests").select("id, units, payout_phone, status, admin_note, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const requests = [
    ...((deposits ?? []) as { id: number; amount_etb: number; reference: string; status: string; admin_note: string | null; created_at: string }[]).map((d) => ({
      key: `d${d.id}`, type: "Deposit", detail: `${formatEtb(Number(d.amount_etb))} · ${d.reference}`, status: d.status, note: d.admin_note, at: d.created_at,
    })),
    ...((withdrawals ?? []) as { id: number; units: number; payout_phone: string; status: string; admin_note: string | null; created_at: string }[]).map((w) => ({
      key: `w${w.id}`, type: "Withdrawal", detail: `${formatUnits(Number(w.units))} → ${w.payout_phone}`, status: w.status, note: w.admin_note, at: w.created_at,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  return (
    <AppShell title="Wallet" next="/wallet">
      {/* Balance */}
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-7">
        <div className="animate-glow pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-lilac/30 blur-3xl" />
        <p className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-lilac"><WalletIcon size={14} /> Balance</p>
        <p className="relative mt-2 text-5xl font-extrabold tracking-tight">{formatUnits(me.balance_units).split(" / ")[0]}</p>
        <p className="relative mt-1 text-mist">{formatEtb(unitsToEtb(me.balance_units))} · 1 unit = {ETB_PER_UNIT} ETB</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Deposit */}
        <section className={card}>
          <h2 className="text-lg font-extrabold">Top up</h2>
          <ol className="mt-3 space-y-2 text-sm text-mist">
            <li>
              1. Send money with <b className="text-white">Telebirr</b> to{" "}
              {TELEBIRR_NUMBER ? (
                <b className="rounded-lg bg-ink px-2 py-0.5 text-lilac-soft">{TELEBIRR_NUMBER}</b>
              ) : (
                <span className="text-amber-100">(number coming soon)</span>
              )}{" "}
              ({TELEBIRR_NAME}).
            </li>
            <li>2. Copy the <b className="text-white">transaction ID</b> from your Telebirr SMS.</li>
            <li>3. Submit it below. Your wallet is credited once we confirm.</li>
          </ol>
          {TELEGRAM_URL && (
            <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
              <SendIcon size={14} /> Need help? Message us on Telegram
            </a>
          )}
          <div className="mt-5">
            <DepositForm etbPerUnit={ETB_PER_UNIT} />
          </div>
        </section>

        {/* Withdraw */}
        <section className={card}>
          <h2 className="text-lg font-extrabold">Withdraw</h2>
          <p className="mt-3 text-sm text-mist">
            Cash out your winnings to Telebirr. The units are held from your balance straight away and sent within 24 hours.
          </p>
          <div className="mt-5">
            <WithdrawForm defaultPhone={me.phone_number?.replace("+251", "0") ?? ""} maxUnits={me.balance_units} />
          </div>
        </section>
      </div>

      {/* Requests */}
      {requests.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="mb-3 text-lg font-extrabold">Requests</h2>
          <div className="divide-y divide-white/5">
            {requests.map((r) => (
              <div key={r.key} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold">{r.type}</p>
                  <p className="text-xs text-mist">{r.detail} · {formatKickoff(r.at)}</p>
                  {r.note && <p className="text-xs text-mist">Note: {r.note}</p>}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${STATUS_STYLE[r.status] ?? "bg-white/10"}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className={`${card} mt-5`}>
        <h2 className="mb-3 text-lg font-extrabold">History</h2>
        {(ledger ?? []).length === 0 ? (
          <p className="text-sm text-mist">No transactions yet.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {((ledger ?? []) as { id: number; amount_units: number; kind: string; reference: string | null; created_at: string }[]).map((t) => {
              const amt = Number(t.amount_units);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{KIND_LABEL[t.kind] ?? t.kind}</p>
                    <p className="truncate text-xs text-mist">{t.reference ?? ""} · {formatKickoff(t.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-extrabold ${amt > 0 ? "text-emerald-200" : "text-white"}`}>
                      {amt > 0 ? "+" : "−"}{Math.abs(amt)} {Math.abs(amt) === 1 ? "unit" : "units"}
                    </p>
                    <p className="text-xs text-mist">{formatEtb(unitsToEtb(Math.abs(amt)))}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </AppShell>
  );
}
