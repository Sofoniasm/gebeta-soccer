import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatKickoff } from "@/lib/format";
import { ETB_PER_UNIT, formatUnits } from "@/lib/money";
import { adjustUnits, markWithdrawalPaid, rejectWithdrawal } from "../actions";
import { AppShell } from "@/components/AppShell";
import { Banner, inputClass, secondaryButtonClass } from "@/components/ui";
import { SubmitButton } from "../SubmitButton";

export const metadata = { title: "Players · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
const small = "rounded-xl border border-white/10 bg-ink/70 px-3 py-2 text-sm text-white outline-none focus:border-lilac";

interface Player { id: string; username: string; email: string | null; phone_number: string | null; balance_units: number; created_at: string; is_admin: boolean }

export default async function PlayersAdminPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; q?: string }> }) {
  await requireAdminId("/admin/players");
  const { msg, err, q = "" } = await searchParams;
  const admin = createAdminClient();

  // Search, or show newest players by default
  let query = admin.from("profiles").select("id, username, email, phone_number, balance_units, created_at, is_admin");
  const term = q.trim().replace(/[%,()]/g, "");
  if (term) {
    const digits = term.replace(/\D/g, "");
    const filters = [`username.ilike.%${term}%`, `email.ilike.%${term}%`];
    if (digits.length >= 4) filters.push(`phone_number.ilike.%${digits.slice(-9)}%`);
    query = query.or(filters.join(","));
  }
  const { data: playerData } = await query.order("created_at", { ascending: false }).limit(30);
  const players = (playerData ?? []) as Player[];

  const { count: totalPlayers } = await admin.from("profiles").select("id", { count: "exact", head: true });

  const { data: pending } = await admin
    .from("withdrawal_requests")
    .select("id, units, payout_phone, created_at, profiles(username)")
    .eq("status", "pending")
    .order("created_at");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withdrawals = (pending ?? []) as any[];

  return (
    <AppShell title="Players" next="/admin/players">
      <div className="mb-5 space-y-3">
        {msg && <Banner kind="success">{msg}</Banner>}
        {err && <Banner kind="error">{err}</Banner>}
      </div>

      {/* Pending withdrawals */}
      <section className={`${card} mb-5 ${withdrawals.length ? "border-amber-200/20" : ""}`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">Pending withdrawals</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${withdrawals.length ? "bg-amber-200/15 text-amber-100" : "bg-white/10 text-mist"}`}>{withdrawals.length}</span>
        </div>
        <p className="mb-3 text-xs text-mist">Units are already held from the player. Send the cash on Telegram/Telebirr, then click Approve.</p>
        {withdrawals.length === 0 ? (
          <p className="text-sm text-mist">Nothing waiting.</p>
        ) : (
          <div className="space-y-2">
            {withdrawals.map((w) => (
              <div key={w.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-ink/40 p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{w.profiles?.username} <span className="text-xs text-mist">#{w.id}</span></p>
                  <p className="text-xs text-mist">{formatKickoff(w.created_at)} · phone <b className="text-white">{w.payout_phone}</b></p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-extrabold text-lilac-soft">{(Number(w.units) * ETB_PER_UNIT).toLocaleString("en-US")} ETB</p>
                  <p className="text-xs text-mist">{formatUnits(Number(w.units))}</p>
                </div>
                <div className="flex w-full flex-wrap gap-2">
                  <form action={markWithdrawalPaid} className="flex gap-2">
                    <input type="hidden" name="requestId" value={w.id} />
                    <input name="note" placeholder="Note (optional)" className={`${small} w-40`} />
                    <SubmitButton className={secondaryButtonClass} confirm="Have you sent the cash? Approve this withdrawal?">Approve</SubmitButton>
                  </form>
                  <form action={rejectWithdrawal} className="flex gap-2">
                    <input type="hidden" name="requestId" value={w.id} />
                    <input name="note" placeholder="Reason" className={`${small} w-36`} />
                    <SubmitButton className="px-2 text-xs font-bold text-rose-300 hover:text-rose-200" confirm="Reject and refund the units?">Reject & refund</SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* User management */}
      <section className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-extrabold">User management</h2>
            <p className="text-xs text-mist">{totalPlayers ?? 0} players · manual adjustments 1–50 units · 1 Unit = {ETB_PER_UNIT} ETB</p>
          </div>
          <form className="flex gap-2">
            <input name="q" defaultValue={q} placeholder="Phone, username or email" className={`${inputClass} w-64 py-2.5`} />
            <button className={secondaryButtonClass}>Search</button>
          </form>
        </div>

        {players.length === 0 ? (
          <p className="py-6 text-center text-sm text-mist">No players found.</p>
        ) : (
          <div className="space-y-2">
            {players.map((u) => (
              <div key={u.id} className="rounded-2xl border border-white/5 bg-ink/40 p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-lilac/20 font-extrabold text-lilac-soft">{u.username.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">
                      {u.username} {u.is_admin && <span className="ml-1 rounded-full bg-lilac/15 px-2 py-0.5 text-[10px] font-bold uppercase text-lilac-soft">Admin</span>}
                    </p>
                    <p className="text-xs text-mist">{u.phone_number ?? "no phone"} · {u.email ?? "no email"} · joined {formatKickoff(u.created_at)}</p>
                  </div>
                  <p className="text-right font-extrabold">{formatUnits(Number(u.balance_units))}</p>
                </div>
                <form action={adjustUnits} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="q" value={q} />
                  <input name="units" type="number" step="0.5" min="1" max="50" defaultValue="1" required className={`${small} w-20`} aria-label="Units (1–50)" />
                  <input name="note" placeholder="Note (optional)" className={`${small} min-w-0 flex-1`} />
                  <SubmitButton name="op" value="add" className={secondaryButtonClass}>Add units</SubmitButton>
                  <SubmitButton
                    name="op"
                    value="deduct"
                    className="inline-flex items-center gap-2 rounded-full border border-rose-300/50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-rose-200 hover:bg-rose-400/10"
                    confirm="Deduct these units from the player?"
                  >
                    Deduct units
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
