import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { formatKickoff } from "@/lib/format";
import { etbLabel } from "@/lib/money";
import { SubmitButton } from "../SubmitButton";

export const metadata = { title: "Challenges · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

async function settleDue() {
  "use server";
  await requireAdminId("/admin/challenges");
  const { data, error } = await createAdminClient().rpc("settle_due_challenges");
  await pushNotifications();
  revalidatePath("/admin/challenges");
  redirect(`/admin/challenges?${error ? `err=${encodeURIComponent(error.message)}` : `msg=${encodeURIComponent(`${data ?? 0} challenge(s) settled or refunded.`)}`}`);
}

interface Row {
  id: number;
  code: string;
  title: string;
  stake_units: number;
  max_players: number | null;
  fee_pct: number;
  status: string;
  lock_at: string;
  prize_units: number | null;
  created_at: string;
  creator_id: string;
}

export default async function AdminChallengesPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdminId("/admin/challenges");
  const { msg, err } = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin.from("challenges").select("*").order("id", { ascending: false }).limit(300);
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, stake_units: Number(r.stake_units), fee_pct: Number(r.fee_pct), prize_units: r.prize_units === null ? null : Number(r.prize_units) }));
  const ids = rows.map((r) => r.id);
  const { data: entries } = ids.length
    ? await admin.from("challenge_entries").select("challenge_id, user_id, rank, payout_units").in("challenge_id", ids)
    : { data: [] };
  const ents = (entries ?? []) as { challenge_id: number; user_id: string; rank: number | null; payout_units: number | null }[];
  const userIds = [...new Set([...ents.map((e) => e.user_id), ...rows.map((r) => r.creator_id)])];
  const { data: profs } = userIds.length ? await admin.from("profiles").select("id, username, phone_number").in("id", userIds) : { data: [] };
  const who = new Map(((profs ?? []) as { id: string; username: string; phone_number: string | null }[]).map((p) => [p.id, p]));

  const now = Date.now();
  let fees = 0;
  let live = 0;
  let staked = 0;
  for (const r of rows) {
    const n = ents.filter((e) => e.challenge_id === r.id).length;
    if (r.status === "settled") fees += r.stake_units * n - (r.prize_units ?? 0);
    if (r.status === "open") {
      live++;
      staked += r.stake_units * n;
    }
  }
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

  return (
    <AppShell title="Challenges" next="/admin/challenges">
      {msg && <div className="mb-4"><Banner kind="success">{msg}</Banner></div>}
      {err && <div className="mb-4"><Banner kind="error">{err}</Banner></div>}

      <div className="mb-5 grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-card/60 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-mist">Open / live</p><p className="mt-1 text-xl font-extrabold">{live}</p></div>
        <div className="rounded-2xl bg-card/60 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-mist">Stakes held</p><p className="mt-1 text-xl font-extrabold">{etbLabel(staked)}</p></div>
        <div className="rounded-2xl bg-card/60 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-mist">Fees earned</p><p className="mt-1 text-xl font-extrabold text-lilac-soft">{etbLabel(fees)}</p></div>
      </div>

      <section className={`${card} mb-5`}>
        <p className="mb-3 text-sm text-mist">
          Challenges settle by themselves after each match sync and whenever a player opens one. Nobody joined by the first kickoff = stake refunded.
          Press this after entering results by hand.
        </p>
        <form action={settleDue}>
          <SubmitButton className="rounded-full bg-lilac px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">Settle finished challenges now</SubmitButton>
        </form>
      </section>

      <section className={card}>
        <h2 className="mb-3 text-lg font-extrabold">All challenges</h2>
        {rows.length === 0 && <p className="text-sm text-mist">No challenges yet.</p>}
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-mist">
              <tr>
                <th className="px-2 py-2">Challenge</th>
                <th className="px-2 py-2">Players (phone)</th>
                <th className="px-2 py-2">Stake</th>
                <th className="px-2 py-2">Pot</th>
                <th className="px-2 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r) => {
                const es = ents.filter((e) => e.challenge_id === r.id);
                const state = r.status === "open" ? (new Date(r.lock_at).getTime() <= now ? "live" : "open") : r.status;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-2 py-3">
                      <Link href={`/challenges/${r.code}`} className="font-bold hover:text-lilac">{r.title}</Link>
                      <p className="text-xs text-mist">{r.code} · by {who.get(r.creator_id)?.username ?? "?"}</p>
                      <p className="text-xs text-mist">Locks {formatKickoff(r.lock_at)}</p>
                    </td>
                    <td className="px-2 py-3 text-xs">
                      {es.map((e) => (
                        <p key={e.user_id} className={e.payout_units && Number(e.payout_units) > 0 ? "font-bold text-emerald-200" : ""}>
                          {who.get(e.user_id)?.username} <span className="text-mist">{who.get(e.user_id)?.phone_number ?? ""}</span>
                          {e.payout_units && Number(e.payout_units) > 0 ? ` · won ${etbLabel(Number(e.payout_units))}` : ""}
                        </p>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3">{etbLabel(r.stake_units)}</td>
                    <td className="whitespace-nowrap px-2 py-3">{etbLabel(r.stake_units * es.length)}</td>
                    <td className="px-2 py-3">
                      <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase">{state}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
