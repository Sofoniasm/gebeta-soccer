import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { etbLabel, unitsLabel } from "@/lib/money";
import { formatKickoff } from "@/lib/format";
import { AppShell } from "@/components/AppShell";
import { Banner, secondaryButtonClass } from "@/components/ui";
import { SubmitButton } from "../../SubmitButton";
import { adjustUnits, unlockLogin } from "../../actions";

export const metadata = { title: "Player · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const KIND: Record<string, string> = {
  deposit: "Telegram deposit",
  entry_fee: "Entry fee",
  payout: "Winnings",
  withdrawal: "Withdrawal",
  refund: "Refund",
  adjustment: "Adjustment",
};

export default async function PlayerDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ msg?: string; err?: string }>;
}) {
  const { id } = await params;
  await requireAdminId(`/admin/players/${id}`);
  const { msg, err } = await searchParams;
  const admin = createAdminClient();

  const { data: p } = await admin
    .from("profiles")
    .select("id, username, phone_number, email, balance_units, created_at, is_admin, phone_verified_at, telegram_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!p) notFound();

  const keys = [p.phone_number, p.username?.toLowerCase(), p.email?.toLowerCase()].filter(Boolean) as string[];
  const [{ data: authUser }, { data: ledger }, { data: withdrawals }, { data: entries }, { data: leagues }, { data: logins }, { data: notes }, { data: preds }] =
    await Promise.all([
      admin.auth.admin.getUserById(id),
      admin.from("wallet_ledger").select("id, amount_units, kind, reference, created_at, rounds(name), leagues(name)").eq("user_id", id).order("created_at", { ascending: false }).limit(200),
      admin.from("withdrawal_requests").select("id, units, payout_phone, status, admin_note, created_at").eq("user_id", id).order("created_at", { ascending: false }),
      admin.from("round_entries").select("created_at, rounds(id, name, status)").eq("user_id", id).order("created_at", { ascending: false }),
      admin.from("league_members").select("status, requested_at, leagues(code, name, entry_fee_units, status)").eq("user_id", id),
      keys.length
        ? admin.from("login_attempts").select("ip, success, created_at").in("login_key", keys).order("created_at", { ascending: false }).limit(30)
        : Promise.resolve({ data: [] }),
      admin.from("notifications").select("title, body, created_at, read_at, telegram_sent_at").eq("user_id", id).order("created_at", { ascending: false }).limit(15),
      admin.from("predictions").select("points_earned, is_default").eq("user_id", id).limit(5000),
    ]);

  type L = { id: number; amount_units: number; kind: string; reference: string | null; created_at: string; rounds: { name: string } | null; leagues: { name: string } | null };
  const tx = ((ledger ?? []) as unknown as L[]).map((t) => ({ ...t, amount_units: Number(t.amount_units) }));
  const total = (k: string) => Math.abs(tx.filter((t) => t.kind === k).reduce((s, t) => s + t.amount_units, 0));
  const predList = (preds ?? []) as { points_earned: number | null; is_default: boolean }[];
  const lastLogin = (authUser?.user?.last_sign_in_at as string | undefined) ?? null;
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  const facts: [string, string][] = [
    ["Phone", p.phone_number ?? "—"],
    ["Email", p.email ?? "— (phone login)"],
    ["Registered", formatKickoff(p.created_at)],
    ["Phone confirmed", p.phone_verified_at ? formatKickoff(p.phone_verified_at) : "Not yet"],
    ["Telegram linked", p.telegram_user_id ? "Yes" : "No"],
    ["Last login", lastLogin ? formatKickoff(lastLogin) : "—"],
  ];
  const totals: [string, string][] = [
    ["Balance", `${unitsLabel(Number(p.balance_units))} · ${etbLabel(Number(p.balance_units))}`],
    ["Deposited", etbLabel(total("deposit"))],
    ["Entry fees", etbLabel(total("entry_fee"))],
    ["Winnings", etbLabel(total("payout"))],
    ["Withdrawn (held/paid)", etbLabel(total("withdrawal") - total("refund"))],
    ["Picks made", `${predList.filter((x) => !x.is_default).length} (+${predList.filter((x) => x.is_default).length} default)`],
    ["Exact scores", String(predList.filter((x) => Number(x.points_earned) === 3).length)],
  ];

  return (
    <AppShell next={`/admin/players/${id}`}>
      <Link href="/admin/players" className="mb-4 inline-block text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
        ← Players
      </Link>
      {msg && <div className="mb-4"><Banner kind="success">{msg}</Banner></div>}
      {err && <div className="mb-4"><Banner kind="error">{err}</Banner></div>}

      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-white/5 bg-gradient-to-br from-[#3a3166] via-card to-ink p-6">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-lilac text-2xl font-extrabold text-ink">{p.username.slice(0, 1).toUpperCase()}</span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-3xl font-extrabold">
              {p.username}
              {p.is_admin && <span className="ml-2 rounded-full bg-lilac/15 px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-lilac-soft">Admin</span>}
            </h1>
            <p className="text-sm text-mist">{p.phone_number ?? "no phone"}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Balance</p>
            <p className="text-3xl font-extrabold">{unitsLabel(Number(p.balance_units))}</p>
            <p className="text-sm text-mist">{etbLabel(Number(p.balance_units))}</p>
          </div>
        </div>
      </section>

      <div className="mb-5 grid gap-5 lg:grid-cols-3">
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Account</h2>
          <dl className="space-y-2 text-sm">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-mist">{k}</dt>
                <dd className="truncate text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Totals</h2>
          <dl className="space-y-2 text-sm">
            {totals.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3">
                <dt className="text-mist">{k}</dt>
                <dd className="text-right font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Actions</h2>
          <form action={adjustUnits} className="space-y-2">
            <input type="hidden" name="userId" value={p.id} />
            <div className="flex gap-2">
              <input name="units" type="number" step="0.5" min="1" max="50" defaultValue="5" required className="w-20 rounded-xl border border-white/10 bg-ink/70 px-3 py-2 text-sm outline-none focus:border-lilac" aria-label="Units" />
              <input name="note" placeholder="Note" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink/70 px-3 py-2 text-sm outline-none focus:border-lilac" />
            </div>
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="op" value="add" className={secondaryButtonClass}>Add units</SubmitButton>
              <SubmitButton name="op" value="deduct" className="rounded-full border border-rose-300/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-rose-200 hover:bg-rose-400/10" confirm="Deduct these units?">
                Deduct
              </SubmitButton>
            </div>
          </form>
          <form action={unlockLogin} className="mt-4 border-t border-white/10 pt-4">
            <input type="hidden" name="userId" value={p.id} />
            <SubmitButton className="text-xs font-bold uppercase tracking-wider text-mist hover:text-white">Unlock login</SubmitButton>
          </form>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,22rem)]">
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Wallet statement</h2>
          {tx.length === 0 ? (
            <p className="text-sm text-mist">No transactions.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <tbody className="divide-y divide-white/5">
                  {tx.map((t) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap py-2.5 pr-3 text-xs text-mist">{formatKickoff(t.created_at)}</td>
                      <td className="py-2.5 pr-3">
                        <p className="font-semibold">
                          {KIND[t.kind] ?? t.kind}
                          {(t.leagues?.name || t.rounds?.name) && <span className="font-normal text-mist"> · {t.leagues ? `League ${t.leagues.name}` : t.rounds?.name}</span>}
                        </p>
                        {t.reference && <p className="truncate text-xs text-mist">{t.reference}</p>}
                      </td>
                      <td className={`whitespace-nowrap py-2.5 text-right font-extrabold ${t.amount_units > 0 ? "text-emerald-200" : "text-rose-200"}`}>
                        {t.amount_units > 0 ? "+" : "−"}
                        {etbLabel(Math.abs(t.amount_units))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-5">
          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Rounds &amp; leagues</h2>
            <ul className="space-y-1.5 text-sm">
              {((entries ?? []) as unknown as { created_at: string; rounds: { name: string; status: string } | null }[]).map((e, i) => (
                <li key={`r${i}`} className="flex justify-between gap-2">
                  <span>⚽ {e.rounds?.name}</span>
                  <span className="text-xs text-mist">{e.rounds?.status}</span>
                </li>
              ))}
              {((leagues ?? []) as unknown as { status: string; leagues: { code: string; name: string; status: string } | null }[]).map((l, i) => (
                <li key={`l${i}`} className="flex justify-between gap-2">
                  <Link href={`/leagues/${l.leagues?.code}`} className="hover:text-lilac">🏳️ {l.leagues?.name}</Link>
                  <span className="text-xs text-mist">{l.status === "active" ? l.leagues?.status : l.status}</span>
                </li>
              ))}
              {(entries ?? []).length === 0 && (leagues ?? []).length === 0 && <li className="text-mist">Hasn&apos;t played yet.</li>}
            </ul>
          </section>

          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Withdrawals</h2>
            {(withdrawals ?? []).length === 0 ? (
              <p className="text-sm text-mist">None.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {((withdrawals ?? []) as { id: number; units: number; payout_phone: string; status: string; created_at: string }[]).map((w) => (
                  <li key={w.id} className="flex justify-between gap-2">
                    <span>
                      #{w.id} · {etbLabel(Number(w.units))} → {w.payout_phone}
                    </span>
                    <span className="text-xs text-mist">{w.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Login history</h2>
            {(logins ?? []).length === 0 ? (
              <p className="text-sm text-mist">No logins recorded yet (kept for 90 days).</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {((logins ?? []) as { ip: string; success: boolean; created_at: string }[]).map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className={l.success ? "text-emerald-200" : "text-rose-200"}>{l.success ? "✓ logged in" : "✗ wrong password"}</span>
                    <span className="text-mist">
                      {formatKickoff(l.created_at)} · {l.ip}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={card}>
            <h2 className="mb-3 text-lg font-extrabold">Notifications sent</h2>
            <ul className="space-y-2 text-xs">
              {((notes ?? []) as { title: string; created_at: string; read_at: string | null; telegram_sent_at: string | null }[]).map((n, i) => (
                <li key={i}>
                  <p className="font-semibold text-white">{n.title}</p>
                  <p className="text-mist">
                    {formatKickoff(n.created_at)} · {n.read_at ? "read" : "unread"}
                    {n.telegram_sent_at ? " · sent on Telegram" : ""}
                  </p>
                </li>
              ))}
              {(notes ?? []).length === 0 && <li className="text-mist">None.</li>}
            </ul>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
