import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { AppShell } from "@/components/AppShell";
import { PLANS, getMyPremium, planEtb } from "@/lib/premium";
import { formatUnits } from "@/lib/money";
import { AutoRenewToggle, BuyButton } from "./PremiumButtons";

export const metadata = { title: "Gebeta Premium · GebetaSoccer" };
export const dynamic = "force-dynamic";

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

export default async function PremiumPage() {
  const me = await getMe("/premium");
  const supabase = await createClient();
  const p = await getMyPremium(supabase, me.id);
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
  const saving = PLANS.monthly.units * 12 - PLANS.yearly.units;

  return (
    <AppShell title="Gebeta Premium ⭐" next="/premium">
      <section className="relative mb-5 overflow-hidden rounded-[2rem] border border-amber-200/20 bg-gradient-to-br from-[#4a3b16] via-card to-ink p-6">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-amber-200/20 blur-3xl" />
        <div className="relative">
          {p.active ? (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">You&apos;re Premium</p>
              <h2 className="mt-1 text-2xl font-extrabold">Active until {fmtDate(p.until!)}</h2>
              <p className="mt-1 text-sm text-mist">
                {p.plan === "yearly" ? "Yearly" : "Monthly"} plan ·{" "}
                {p.autoRenew ? `renews automatically from your wallet (${formatUnits(PLANS[p.plan!].units)})` : "auto-renew is off: it simply ends on that date"}
              </p>
              <div className="mt-4"><AutoRenewToggle on={p.autoRenew} /></div>
            </>
          ) : (
            <>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-200">Gebeta Premium</p>
              <h2 className="mt-1 text-2xl font-extrabold">See how the crowd and the leaders pick</h2>
              <p className="mt-1 text-sm text-mist">Paid from your wallet. No card needed. Cancel any time.</p>
            </>
          )}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="text-lg font-extrabold">What you get</h2>
          <ul className="mt-3 space-y-3 text-sm text-mist">
            <li>📊 <b className="text-white">Crowd picks while a round is open:</b> for every match, how many slips pick home, draw or away, and the most picked score. Anonymous, shown once 5 slips are in.</li>
            <li>📈 <b className="text-white">Form guide on every pick card:</b> a rough home / draw / away % from both teams&apos; last 5 results and home advantage (everyone sees the coloured form blocks).</li>
            <li>🔍 <b className="text-white">Full slips of any player</b> on the leaderboard, all 10 picks with live points, as soon as the round locks.</li>
            <li>🔒 <b className="text-white">Fair for everyone:</b> nobody, Premium or not, can see another player&apos;s picks before the round locks. Private challenges stay completely private.</li>
          </ul>
        </section>

        <section className={card}>
          <h2 className="text-lg font-extrabold">{p.active ? "Add more time" : "Choose a plan"}</h2>
          <p className="mt-1 text-sm text-mist">
            Your wallet: <b className="text-white">{formatUnits(me.balance_units)}</b>.{" "}
            {p.active && "Buying now adds the time on top of what you have."}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-ink/40 p-4">
              <p className="font-bold text-white">Monthly</p>
              <p className="mt-1 text-2xl font-extrabold">{planEtb("monthly").toLocaleString("en-US")} ETB</p>
              <p className="mb-3 text-xs text-mist">{formatUnits(PLANS.monthly.units)} · 30 days</p>
              <BuyButton plan="monthly" label={`Pay ${PLANS.monthly.units} Units`} disabled={Number(me.balance_units) < PLANS.monthly.units} />
            </div>
            <div className="rounded-2xl border border-amber-200/30 bg-amber-200/5 p-4">
              <p className="font-bold text-white">Yearly <span className="ml-1 rounded-full bg-amber-200/20 px-2 py-0.5 text-[10px] text-amber-100">save {(saving * 200).toLocaleString("en-US")} ETB</span></p>
              <p className="mt-1 text-2xl font-extrabold">{planEtb("yearly").toLocaleString("en-US")} ETB</p>
              <p className="mb-3 text-xs text-mist">{formatUnits(PLANS.yearly.units)} · 365 days</p>
              <BuyButton plan="yearly" label={`Pay ${PLANS.yearly.units} Units`} disabled={Number(me.balance_units) < PLANS.yearly.units} />
            </div>
          </div>
          {Number(me.balance_units) < PLANS.monthly.units && (
            <p className="mt-3 text-xs text-mist">
              Not enough Units yet. <Link href="/wallet" className="font-semibold text-lilac">Top up your wallet →</Link>
            </p>
          )}
          <p className="mt-4 text-xs text-mist">
            Premium is a paid information service: it doesn&apos;t change your points or your chance to win. Units spent on Premium are not refunded. By paying you agree to the{" "}
            <Link href="/terms" className="font-semibold text-lilac">Premium terms (section 3c)</Link>.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
