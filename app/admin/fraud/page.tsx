import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { AppShell } from "@/components/AppShell";
import { runFraudWatch } from "@/lib/fraud-watch";
import { RULES, type Severity } from "@/lib/fraud-rules";
import { AiSummary } from "./AiSummary";

export const metadata = { title: "Fraud Watch · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const SEV: Record<Severity, string> = {
  high: "border-rose-300/40 bg-rose-400/15 text-rose-200",
  medium: "border-amber-200/40 bg-amber-300/10 text-amber-100",
  low: "border-white/15 bg-white/5 text-mist",
};

export default async function FraudWatchPage() {
  await requireAdminId("/admin/fraud");
  const { flagged, checked } = await runFraudWatch();
  const high = flagged.filter((f) => f.flags.some((x) => x.severity === "high")).length;
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

  return (
    <AppShell title="Fraud Watch" next="/admin/fraud">
      <p className="mb-5 text-sm text-mist">
        Checked {checked} accounts (money from the last 180 days, logins from the last 30). <b className="text-white">{flagged.length}</b> flagged, <b className="text-rose-200">{high}</b> with a strong signal.
        A flag is a reason to look, not proof. Check the player&apos;s page before you hold or reject a withdrawal.
      </p>

      {flagged.length === 0 ? (
        <section className={card}><p className="text-sm text-mist">✅ Nothing suspicious right now.</p></section>
      ) : (
        <ul className="space-y-4">
          {flagged.map((f) => (
            <li key={f.user.id} className={`${card} ${f.flags.some((x) => x.severity === "high") ? "border-rose-300/30" : ""}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link href={`/admin/players/${f.user.id}`} className="text-lg font-extrabold text-lilac hover:text-lilac-soft">{f.user.username}</Link>
                <span className="text-xs text-mist">{f.user.phone_number ?? "no phone"} · risk score {f.score}</span>
              </div>
              <ul className="mt-3 space-y-2">
                {f.flags.map((x, i) => (
                  <li key={i} className="text-sm">
                    <span className={`mr-2 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${SEV[x.severity]}`}>{x.severity}</span>
                    <b className="text-white">{x.rule}.</b> <span className="text-mist">{x.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-mist/80">
                In {f.facts.deposits} · bonus {f.facts.bonuses} · played {f.facts.played} · won {f.facts.won} · withdrawals asked {f.facts.withdrawn} (Units)
              </p>
              <AiSummary userId={f.user.id} />
            </li>
          ))}
        </ul>
      )}

      <section className={`${card} mt-5 text-xs text-mist`}>
        <h2 className="mb-2 text-sm font-extrabold text-white">What we check</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-white">{RULES.sharedPayout}</b> (high): two or more accounts ask to be paid to the same Telebirr number.</li>
          <li><b className="text-white">{RULES.payoutIsOtherPlayer}</b> (high): the payout number is another player&apos;s registered phone.</li>
          <li><b className="text-white">{RULES.noPlay}</b> (high): deposits or bonuses, then a withdrawal, with no round or Premium ever paid.</li>
          <li><b className="text-white">{RULES.lowPlay}</b> (medium): spent less than 20% of what came in before withdrawing.</li>
          <li><b className="text-white">{RULES.newAccountCashout}</b> (medium): first withdrawal within 3 days of signing up.</li>
          <li><b className="text-white">{RULES.sharedNetwork}</b> (low): 3+ accounts logged in from one IP. Common on Ethio Telecom / Safaricom mobile data, so only weigh it with other signals.</li>
        </ul>
        <p className="mt-2">Each phone number can only be on one account, so duplicate accounts usually show up as a shared payout number or a shared network.</p>
      </section>
    </AppShell>
  );
}
