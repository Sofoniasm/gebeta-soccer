import Link from "next/link";
import { redirect } from "next/navigation";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { etbLabel, formatUnits, unitsLabel } from "@/lib/money";
import { formatKickoff } from "@/lib/format";
import { inviteLink } from "@/lib/referrals";
import { AppShell } from "@/components/AppShell";
import { CopyLink } from "./CopyLink";

export const metadata = { title: "Sales · GebetaSoccer" };
export const dynamic = "force-dynamic";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

interface Sales {
  code: string | null;
  referred: number;
  total_units: number;
  earnings: { at: string; amount_units: number; stake_units: number; label: string | null; kind: "round" | "challenge"; player: string }[];
  players: { username: string; joined_at: string | null }[];
}

export default async function SalesPage() {
  const me = await getMe("/sales");
  if (!me.referral_code) redirect("/career");
  const supabase = await createClient();
  // Only the signed-in salesperson's own numbers (security-definer RPC).
  const { data, error } = await supabase.rpc("get_my_sales");
  const s = (data ?? { code: me.referral_code, referred: 0, total_units: 0, earnings: [], players: [] }) as Sales;
  const total = Number(s.total_units);
  const link = inviteLink(SITE_URL, me.referral_code);

  return (
    <AppShell title="Sales" next="/sales">
      {error && <p className="mb-5 rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">Could not load your sales numbers. Please try again later.</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Your code</p>
          <p className="mt-1 text-4xl font-extrabold tracking-wider">{me.referral_code}</p>
          <p className="mt-3 text-sm text-mist">Share this link. Everyone who signs up with it is your player.</p>
          <div className="mt-4">
            <CopyLink url={link} />
          </div>
        </section>

        <section className={card}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Players invited</p>
              <p className="mt-1 text-3xl font-extrabold">{Number(s.referred)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Total earned</p>
              <p className="mt-1 text-3xl font-extrabold">{unitsLabel(total)}</p>
              <p className="text-xs text-mist">{etbLabel(total)}</p>
            </div>
          </div>
          <div className="mt-5 space-y-1 text-xs leading-relaxed text-mist">
            <p>• <b className="text-white">Rounds:</b> 5% of the house share of your players&apos; stakes.</p>
            <p>• <b className="text-white">Challenges:</b> 2% of the 10% fee on your players&apos; stakes.</p>
            <p>• Paid into your wallet when the round or challenge is settled. Refunded stakes earn nothing.</p>
            <p>
              • To cash out, use the normal <Link href="/wallet" className="font-semibold text-lilac">Wallet withdrawal</Link>.
            </p>
          </div>
        </section>
      </div>

      <section className={`${card} mt-5`}>
        <h2 className="mb-3 text-lg font-extrabold">Commission</h2>
        {s.earnings.length === 0 ? (
          <p className="text-sm text-mist">No commission yet. You earn when your players&apos; rounds and challenges are settled.</p>
        ) : (
          <div className="space-y-2">
            {s.earnings.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-ink/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{e.label ?? (e.kind === "challenge" ? "Challenge" : "Round")} · {e.player}</p>
                  <p className="text-xs text-mist">{formatKickoff(e.at)} · stake {formatUnits(Number(e.stake_units))}</p>
                </div>
                <p className="font-extrabold text-emerald-200">+{formatUnits(Number(e.amount_units))}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {s.players.length > 0 && (
        <section className={`${card} mt-5`}>
          <h2 className="mb-3 text-lg font-extrabold">Your players</h2>
          <div className="flex flex-wrap gap-2">
            {s.players.map((p) => (
              <span key={p.username} className="rounded-full bg-white/5 px-3 py-1 text-xs font-semibold">{p.username}</span>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
