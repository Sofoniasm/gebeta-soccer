import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatUnits } from "@/lib/money";
import { formatKickoff } from "@/lib/format";
import { SITE_URL } from "@/lib/site";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { inviteLink, referralLookalikes, type RefLogin, type RefPerson, type RefWithdrawal } from "@/lib/referrals";
import { removeReferralCode, setReferralCode } from "../actions";
import { AppShell } from "@/components/AppShell";
import { Banner, secondaryButtonClass } from "@/components/ui";
import { SubmitButton } from "../SubmitButton";

export const metadata = { title: "Sales & Referrals · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
const small = "rounded-xl border border-white/10 bg-ink/70 px-3 py-2 text-sm text-white outline-none focus:border-lilac";

interface Seller extends RefPerson { balance_units: number; referral_code: string }
interface Referred extends RefPerson { referred_by: string; referred_at: string | null }
interface W extends RefWithdrawal { id: number; units: number; created_at: string }

export default async function SalesAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdminId("/admin/sales");
  const { msg, err } = await searchParams;
  const admin = createAdminClient();

  const { data: sellerData, error: sellerError } = await admin
    .from("profiles")
    .select("id, username, phone_number, balance_units, referral_code, referral_ip")
    .not("referral_code", "is", null)
    .order("username");
  const sellers = (sellerData ?? []) as Seller[];
  const ids = sellers.map((s) => s.id);

  const [{ data: refData }, { data: earnData }] = await Promise.all([
    ids.length
      ? admin.from("profiles").select("id, username, phone_number, referred_by, referred_at, referral_ip").in("referred_by", ids).limit(20000)
      : Promise.resolve({ data: [] }),
    ids.length ? admin.from("referral_earnings").select("salesperson_id, amount_units").in("salesperson_id", ids).limit(50000) : Promise.resolve({ data: [] }),
  ]);
  const referred = (refData ?? []) as Referred[];
  const everyone = [...sellers, ...referred];
  const allIds = everyone.map((p) => p.id);

  // Withdrawals (for payouts and fraud checks) and recent logins (IPs) of salespeople and their players.
  const keyOwner = new Map<string, string>();
  for (const p of everyone) {
    keyOwner.set(p.username.toLowerCase(), p.id);
    const ph = p.phone_number ? normalizeEthiopianPhone(p.phone_number) ?? p.phone_number : null;
    if (ph) keyOwner.set(ph, p.id);
  }
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString();
  const [{ data: wData }, { data: loginData }] = await Promise.all([
    allIds.length
      ? admin.from("withdrawal_requests").select("id, user_id, units, payout_phone, status, created_at").in("user_id", allIds).order("created_at", { ascending: false }).limit(20000)
      : Promise.resolve({ data: [] }),
    keyOwner.size
      ? admin.from("login_attempts").select("login_key, ip").eq("success", true).gte("created_at", since).in("login_key", [...keyOwner.keys()].slice(0, 2000)).limit(20000)
      : Promise.resolve({ data: [] }),
  ]);
  const withdrawals = (wData ?? []) as W[];
  const logins: RefLogin[] = ((loginData ?? []) as { login_key: string; ip: string }[])
    .map((l) => ({ user_id: keyOwner.get(l.login_key) ?? "", ip: l.ip }))
    .filter((l) => l.user_id);

  const earned = new Map<string, number>();
  for (const e of (earnData ?? []) as { salesperson_id: string; amount_units: number }[]) {
    earned.set(e.salesperson_id, Math.round(((earned.get(e.salesperson_id) ?? 0) + Number(e.amount_units)) * 100) / 100);
  }
  const rows = sellers.map((s) => {
    const mine = referred.filter((r) => r.referred_by === s.id);
    return {
      s,
      players: mine,
      total: earned.get(s.id) ?? 0,
      pending: withdrawals.filter((w) => w.user_id === s.id && w.status === "pending"),
      flags: referralLookalikes({ salesperson: s, referred: mine, withdrawals, logins }),
    };
  });
  const totalCommission = rows.reduce((a, r) => a + r.total, 0);
  const pendingCount = rows.reduce((a, r) => a + r.pending.length, 0);

  return (
    <AppShell title="Sales & Referrals" next="/admin/sales">
      <div className="mb-5 space-y-3">
        {msg && <Banner kind="success">{msg}</Banner>}
        {err && <Banner kind="error">{err}</Banner>}
        {sellerError && <Banner kind="error">Run the 0044_referrals.sql migration in Supabase first ({sellerError.message}).</Banner>}
      </div>

      <section className={`${card} mb-5`}>
        <h2 className="text-lg font-extrabold">How it works</h2>
        <ul className="mt-2 space-y-1 text-sm text-mist">
          <li>• Give a player a code. Their invite link is <b className="text-white">{inviteLink(SITE_URL, "CODE")}</b>.</li>
          <li>• They earn <b className="text-white">5% of the house cut</b> on their players&apos; round stakes and <b className="text-white">2% of the fee</b> on challenge stakes, paid to their wallet when the game is settled. Refunded stakes and leagues pay nothing. If nobody wins a round, it is still only 5% of the normal 30% cut.</li>
          <li>
            • Payouts: the salesperson asks for a normal <b className="text-white">withdrawal</b> in their Wallet. Approve it on{" "}
            <Link href="/admin/players" className="font-semibold text-lilac">Players → Pending withdrawals</Link> after sending Telebirr/CBE.
          </li>
          <li>• Removing a code stops the link and new commission. Commission already paid stays.</li>
        </ul>
        <form action={setReferralCode} className="mt-4 flex flex-wrap gap-2">
          <input name="who" placeholder="Username or phone" required className={`${small} min-w-0 flex-1`} />
          <input name="code" placeholder="Code, e.g. LAKI10" required className={`${small} w-40 uppercase`} pattern="[A-Za-z0-9]{3,20}" />
          <SubmitButton className={secondaryButtonClass}>Give code</SubmitButton>
        </form>
      </section>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Stat label="Salespeople" value={String(sellers.length)} />
        <Stat label="Players invited" value={String(referred.length)} />
        <Stat label="Commission paid" value={formatUnits(totalCommission)} />
      </div>
      {pendingCount > 0 && (
        <p className="mb-5 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-4 py-3 text-sm text-amber-50">
          {pendingCount} withdrawal{pendingCount === 1 ? "" : "s"} from salespeople waiting.{" "}
          <Link href="/admin/players" className="font-bold underline">Open Pending withdrawals</Link>
        </p>
      )}

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">Salespeople</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-mist">No salespeople yet. Give a player a code above.</p>
        ) : (
          <div className="space-y-3">
            {rows.map(({ s, players, total, pending, flags }) => (
              <div key={s.id} className={`rounded-2xl border bg-ink/40 p-4 ${flags.length ? "border-rose-300/30" : "border-white/5"}`}>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      <Link href={`/admin/sales/${s.id}`} className="hover:text-lilac">{s.username}</Link>{" "}
                      <span className="ml-1 rounded-full bg-lilac/15 px-2 py-0.5 text-xs font-extrabold tracking-wider text-lilac-soft">{s.referral_code}</span>
                    </p>
                    <p className="text-xs text-mist">{s.phone_number ?? "no phone"} · {players.length} player{players.length === 1 ? "" : "s"} invited</p>
                  </div>
                  <div className="text-right text-sm">
                    <p>Commission <b>{formatUnits(total)}</b></p>
                    <p className="text-xs text-mist">Balance {formatUnits(Number(s.balance_units))}</p>
                    <Link href={`/admin/sales/${s.id}`} className="text-xs font-bold uppercase tracking-wider text-lilac">Full ledger →</Link>
                  </div>
                </div>

                {pending.length > 0 && (
                  <p className="mt-2 text-xs text-amber-100">
                    ⏳ Pending withdrawal: {pending.map((w) => `#${w.id} ${formatUnits(Number(w.units))} to ${w.payout_phone}`).join(", ")} ·{" "}
                    <Link href="/admin/players" className="font-bold underline">approve on Players</Link>
                  </p>
                )}

                {flags.length > 0 && (
                  <div className="mt-3 rounded-xl border border-rose-300/30 bg-rose-400/10 p-3 text-xs text-rose-50">
                    <p className="font-bold">⚠️ Invited players that look like the salesperson (check before paying):</p>
                    <ul className="mt-1 space-y-1">
                      {flags.map((f) => (
                        <li key={f.playerId}>
                          <Link href={`/admin/players/${f.playerId}`} className="font-bold underline">{f.username}</Link>: {f.reasons.join("; ")}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-rose-100/70">A flag is a reason to look, not proof. See also <Link href="/admin/fraud" className="underline">Fraud Watch</Link>.</p>
                  </div>
                )}

                {players.length > 0 && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer font-semibold text-mist">Invited players</summary>
                    <ul className="mt-2 space-y-1">
                      {players.map((p) => (
                        <li key={p.id}>
                          <Link href={`/admin/players/${p.id}`} className="hover:text-lilac">{p.username}</Link>{" "}
                          <span className="text-mist">· {p.phone_number ?? "no phone"}{p.referred_at ? ` · joined ${formatKickoff(p.referred_at)}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  <form action={setReferralCode} className="flex gap-2">
                    <input type="hidden" name="userId" value={s.id} />
                    <input name="code" defaultValue={s.referral_code} required className={`${small} w-32 uppercase`} pattern="[A-Za-z0-9]{3,20}" aria-label="New code" />
                    <SubmitButton className={secondaryButtonClass}>Change code</SubmitButton>
                  </form>
                  <form action={removeReferralCode}>
                    <input type="hidden" name="userId" value={s.id} />
                    <SubmitButton className="px-2 py-2 text-xs font-bold text-rose-300 hover:text-rose-200" confirm={`Remove code ${s.referral_code}? The link stops working and no new commission is paid.`}>
                      Remove code
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="mt-4 text-xs text-mist">Tip: you can also give a code on a player&apos;s page.</p>
    </AppShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-card/60 p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">{label}</p>
      <p className="mt-1 text-lg font-extrabold">{value}</p>
    </div>
  );
}
