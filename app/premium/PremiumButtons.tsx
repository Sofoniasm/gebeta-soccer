"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buyPremium, setAutoRenew } from "./actions";
import type { Plan } from "@/lib/premium";

const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "long", year: "numeric" }).format(d);

/**
 * Pay for Premium from the wallet. The first tap opens a confirmation on the
 * page (no browser pop-up) showing exactly when Premium starts and ends:
 * from today, or from the end of the current Premium when it is still active.
 */
export function BuyButton({ plan, label, days, units, activeUntil, disabled }: { plan: Plan; label: string; days: number; units: number; activeUntil?: string | null; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const now = new Date();
  const from = activeUntil && new Date(activeUntil).getTime() > now.getTime() ? new Date(activeUntil) : now;
  const until = new Date(from.getTime() + days * 86_400_000);
  const extending = from !== now;

  return (
    <div>
      {asking && !pending ? (
        <div className="rounded-2xl border border-amber-200/30 bg-amber-200/10 p-3 text-sm">
          <p className="font-semibold text-amber-50">
            Pay {units} Units from your wallet?
          </p>
          <p className="mt-1 text-xs text-mist">
            {extending ? (
              <>Adds {days} days after your current Premium: <b className="text-white">until {fmtDay(until)}</b>.</>
            ) : (
              <>Starts <b className="text-white">today, {fmtDay(now)}</b> and runs <b className="text-white">until {fmtDay(until)}</b>.</>
            )}{" "}
            Renews automatically unless you turn it off.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() =>
                start(async () => {
                  const r = await buyPremium(plan);
                  setMsg({ ok: r.ok, text: r.message });
                  setAsking(false);
                  if (r.ok) router.refresh();
                })
              }
              className="flex-1 rounded-full bg-lilac px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-ink hover:bg-lilac-soft"
            >
              Yes, pay
            </button>
            <button
              type="button"
              onClick={() => setAsking(false)}
              className="rounded-full border border-white/15 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-mist hover:text-white"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={pending || disabled}
          onClick={() => {
            setMsg(null);
            setAsking(true);
          }}
          className="w-full rounded-full bg-lilac px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft disabled:opacity-40"
        >
          {pending ? "Paying…" : label}
        </button>
      )}
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-200" : "text-rose-200"}`}>{msg.text}</p>}
    </div>
  );
}

export function AutoRenewToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setAutoRenew(!on);
            setMsg(r.message);
            if (r.ok) router.refresh();
          })
        }
        className="rounded-full border border-white/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 disabled:opacity-40"
      >
        {on ? "Turn off auto-renew" : "Turn on auto-renew"}
      </button>
      {msg && <span className="text-xs text-mist">{msg}</span>}
    </div>
  );
}
