import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { getCareer } from "@/lib/career";
import { ETB_PER_UNIT, MAX_DEPOSIT_UNITS, MIN_DEPOSIT_UNITS, etbLabel, formatUnits, unitsLabel } from "@/lib/money";
import { formatKickoff } from "@/lib/format";
import { TELEGRAM_HANDLE, TELEGRAM_URL } from "@/lib/config";
import { AppShell } from "@/components/AppShell";
import { WithdrawForm } from "./WalletForms";
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
  paid: "bg-emerald-300/15 text-emerald-100",
  rejected: "bg-rose-400/15 text-rose-100",
};
const STATUS_LABEL: Record<string, string> = { pending: "Pending", paid: "Paid", rejected: "Rejected · refunded" };

export default async function WalletPage() {
  const me = await getMe("/wallet");
  const supabase = await createClient();

  const [{ data: ledger }, { data: withdrawals }] = await Promise.all([
    supabase
      .from("wallet_ledger")
      .select("id, amount_units, kind, reference, created_at, round_id, league_id, rounds(name), leagues(name)")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("withdrawal_requests").select("id, units, payout_phone, status, admin_note, created_at").order("created_at", { ascending: false }).limit(10),
  ]);

  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  // Rank per round, so winnings read "Won Week 1 (Rank 1)"
  const rankOf = new Map((await getCareer(me.id)).rounds.map((r) => [r.round_id, r.rank]));
  type Tx = {
    id: number;
    amount_units: number;
    kind: string;
    reference: string | null;
    created_at: string;
    round_id: number | null;
    league_id: number | null;
    rounds: { name: string } | null;
    leagues: { name: string } | null;
  };
  const describe = (t: Tx): { title: string; note: string } => {
    const amt = Number(t.amount_units);
    const round = t.rounds?.name ?? (t.round_id ? `Round ${t.round_id}` : "");
    const league = t.leagues?.name;
    switch (t.kind) {
      case "deposit":
        return { title: "Telegram deposit", note: (t.reference ?? "").replace(/^Telegram deposit ?·? ?/, "") };
      case "entry_fee":
        return { title: league ? `Joined league ${league}` : `Joined ${round}`, note: "Entry fee" };
      case "payout": {
        if (league) {
          const m = (t.reference ?? "").match(/\(Rank (\d+)\)/);
          return { title: `Won league ${league}${m ? ` (Rank ${m[1]})` : ""}`, note: "70% of the league pot" };
        }
        const r = t.round_id ? rankOf.get(t.round_id) : null;
        return { title: `Won ${round}${r ? ` (Rank ${r})` : ""}`, note: "Prize money" };
      }
      case "withdrawal":
        return { title: (t.reference ?? "Withdrawal").replace("Withdrawal request", "Withdrawal"), note: "On hold until sent to your Telebirr" };
      case "refund":
        return { title: "Refund", note: t.reference ?? "" };
      case "adjustment":
        return { title: amt > 0 ? "Added by admin" : "Deducted by admin", note: t.reference ?? "" };
      default:
        return { title: KIND_LABEL[t.kind] ?? t.kind, note: t.reference ?? "" };
    }
  };

  return (
    <AppShell title="Wallet" next="/wallet">
      {/* Balance */}
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-lilac/20 bg-gradient-to-br from-[#4a3f86] via-card to-ink p-7">
        <div className="animate-glow pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-lilac/30 blur-3xl" />
        <p className="relative flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-lilac"><WalletIcon size={14} /> Balance</p>
        <p className="relative mt-2 text-5xl font-extrabold tracking-tight">{unitsLabel(me.balance_units)}</p>
        <p className="relative mt-1 text-lg text-mist">({etbLabel(me.balance_units)})</p>
        <p className="relative mt-3 text-xs text-mist/80">1 Unit = {ETB_PER_UNIT} ETB</p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Deposit — manual via Telegram */}
        <section className={card}>
          <h2 className="text-lg font-extrabold">Add funds</h2>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            To add funds, send a minimum of <b className="text-white">{MIN_DEPOSIT_UNITS * ETB_PER_UNIT} ETB ({MIN_DEPOSIT_UNITS} Units)</b> and a maximum of{" "}
            <b className="text-white">{(MAX_DEPOSIT_UNITS * ETB_PER_UNIT).toLocaleString("en-US")} ETB ({MAX_DEPOSIT_UNITS} Units)</b> to our Telegram admin.
            Once confirmed, your balance will update here.
          </p>
          <div className="mt-4 rounded-2xl bg-ink/60 p-4 text-sm">
            <p className="text-mist">Quote your username when you message us:</p>
            <p className="mt-1 text-lg font-extrabold text-lilac-soft">{me.username}</p>
          </div>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-lilac px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink shadow-lg shadow-lilac/20 transition hover:bg-lilac-soft sm:w-auto"
          >
            <SendIcon size={16} /> Message {TELEGRAM_HANDLE}
          </a>
        </section>

        {/* Withdraw */}
        <section className={card}>
          <h2 className="text-lg font-extrabold">Withdraw</h2>
          <p className="mt-3 text-sm text-mist">
            The units are taken from your balance straight away and held for you, so they can&apos;t be spent while the admin sends your cash.
          </p>
          <div className="mt-5">
            <WithdrawForm defaultPhone={me.phone_number?.replace("+251", "0") ?? ""} maxUnits={Math.max(0, Math.floor((me.balance_units - 1) * 2) / 2)} />
          </div>
        </section>
      </div>

      {/* Withdrawal requests */}
      {(withdrawals ?? []).length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="mb-3 text-lg font-extrabold">Withdrawal requests</h2>
          <div className="divide-y divide-white/5">
            {((withdrawals ?? []) as { id: number; units: number; payout_phone: string; status: string; admin_note: string | null; created_at: string }[]).map((w) => (
              <div key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <div>
                  <p className="font-semibold">{formatUnits(Number(w.units))}</p>
                  <p className="text-xs text-mist">To {w.payout_phone} · {formatKickoff(w.created_at)}</p>
                  {w.admin_note && <p className="text-xs text-mist">Note: {w.admin_note}</p>}
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[w.status] ?? "bg-white/10"}`}>{STATUS_LABEL[w.status] ?? w.status}</span>
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
            {((ledger ?? []) as unknown as Tx[]).map((t) => {
              const amt = Number(t.amount_units);
              const d = describe(t);
              return (
                <div key={t.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{d.title}</p>
                    <p className="truncate text-xs text-mist">
                      {formatKickoff(t.created_at)}
                      {d.note ? ` · ${d.note}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`font-extrabold ${amt > 0 ? "text-emerald-200" : "text-rose-200"}`}>
                      {amt > 0 ? "+" : "−"}{unitsLabel(Math.abs(amt))}
                    </p>
                    <p className="text-xs text-mist">({etbLabel(Math.abs(amt))})</p>
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
