import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { SITE_URL } from "@/lib/site";
import { etbLabel, formatUnits, unitsLabel } from "@/lib/money";
import { formatKickoff } from "@/lib/format";
import { inviteLink, salesScore } from "@/lib/referrals";
import { AppShell } from "@/components/AppShell";
import { CopyLink } from "./CopyLink";

export const metadata = { title: "Invite friends · GebetaSoccer" };
export const dynamic = "force-dynamic";

const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

interface Sales {
  code: string | null;
  referred: number;
  active: number;
  wins: number;
  total_units: number;
  earnings: { at: string; amount_units: number; stake_units: number; label: string | null; kind: "round" | "challenge"; player: string }[];
  players: { username: string; joined_at: string | null; games: number; wins: number; earned: number }[];
}

export default async function SalesPage() {
  const me = await getMe("/sales");
  const supabase = await createClient();
  // Only the signed-in player's own friends and numbers (security-definer RPC).
  const { data, error } = await supabase.rpc("get_my_sales");
  const s = (data ?? { code: me.referral_code, referred: 0, active: 0, wins: 0, total_units: 0, earnings: [], players: [] }) as Sales;
  const code = s.code ?? me.referral_code;
  const total = Number(s.total_units);
  const score = salesScore(Number(s.referred), Number(s.active), Number(s.wins));

  return (
    <AppShell title="Invite friends" next="/sales">
      {error && <p className="mb-5 rounded-2xl border border-rose-300/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">Could not load your numbers. Please try again later.</p>}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Your code</p>
          {code ? (
            <>
              <p className="mt-1 text-4xl font-extrabold tracking-wider">{code}</p>
              <p className="mt-3 text-sm text-mist">Send this link to your friends. Everyone who signs up with it is on your list.</p>
              <div className="mt-4">
                <CopyLink url={inviteLink(SITE_URL, code)} />
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-mist">Your code is being prepared. Please check again soon.</p>
          )}
        </section>

        <section className={card}>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Friends</p>
              <p className="mt-1 text-3xl font-extrabold">{Number(s.referred)}</p>
              <p className="text-xs text-mist">{Number(s.active)} played</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Their wins</p>
              <p className="mt-1 text-3xl font-extrabold">{Number(s.wins)}</p>
              <p className="text-xs text-mist">paid you</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">You earned</p>
              <p className="mt-1 text-xl font-extrabold">{unitsLabel(total)}</p>
              <p className="text-xs text-mist">{etbLabel(total)}</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-lilac/10 p-3 text-sm">
            <p>
              <b>Sales level: {score.level}</b> · {score.points} points
            </p>
            <p className="text-xs text-mist">
              {score.next ? `${score.toNext} more points to ${score.next}.` : "You are at the top level."} 1 point per friend, 2 per friend who plays, 5 per friend win. The level is for show; it gives no extra money.
            </p>
          </div>
        </section>
      </div>

      <section className={`${card} mt-5`}>
        <h2 className="text-lg font-extrabold">How you earn</h2>
        <div className="mt-2 space-y-1 text-sm text-mist">
          <p>• You earn only from friends you invited yourself, one level.</p>
          <p>• When a friend <b className="text-white">wins</b> a round or a challenge, you get <b className="text-white">5%</b> (rounds) or <b className="text-white">2%</b> (challenges) of the house&apos;s share of their bet. It is paid into your wallet, never taken from your friend&apos;s prize.</p>
          <p>• If your friend loses, or the bet is refunded, you earn nothing for that game.</p>
          <p>
            • You can also play yourself. To cash out, use the normal <Link href="/wallet" className="font-semibold text-lilac">Wallet withdrawal</Link>.
          </p>
        </div>
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="mb-3 text-lg font-extrabold">Your friends ({s.players.length})</h2>
        {s.players.length === 0 ? (
          <p className="text-sm text-mist">Nobody yet. Share your link to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {["Friend", "Joined", "Games", "Wins", "You earned"].map((h) => (
                    <th key={h} className="px-2 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-mist">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.players.map((p) => (
                  <tr key={p.username} className="border-t border-white/5">
                    <td className="px-2 py-2 font-bold">{p.username}</td>
                    <td className="px-2 py-2">{p.joined_at ? formatKickoff(p.joined_at) : "—"}</td>
                    <td className="px-2 py-2">{Number(p.games)}</td>
                    <td className="px-2 py-2">{Number(p.wins)}</td>
                    <td className="px-2 py-2 font-bold text-emerald-200">{formatUnits(Number(p.earned))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={`${card} mt-5`}>
        <h2 className="mb-3 text-lg font-extrabold">Your commission</h2>
        {s.earnings.length === 0 ? (
          <p className="text-sm text-mist">No commission yet. You earn when a friend wins a settled round or challenge.</p>
        ) : (
          <div className="space-y-2">
            {s.earnings.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-ink/40 p-3">
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{e.player} won · {e.label ?? (e.kind === "challenge" ? "Challenge" : "Round")}</p>
                  <p className="text-xs text-mist">{formatKickoff(e.at)} · their stake {formatUnits(Number(e.stake_units))}</p>
                </div>
                <p className="font-extrabold text-emerald-200">+{formatUnits(Number(e.amount_units))}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
