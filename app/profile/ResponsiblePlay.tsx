"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inputClass } from "@/components/ui";
import { saveDepositLimit, takeBreak } from "./actions";

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const etb = (units: number) => `${Math.round(units * 200).toLocaleString("en-US")} ETB`;

export function ResponsiblePlay({
  breakUntil,
  limitUnits,
  nextUnits,
  nextAt,
  deposited7d,
}: {
  breakUntil: string | null;
  limitUnits: number | null;
  nextUnits: number | null;
  nextAt: string | null;
  deposited7d: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [ask, setAsk] = useState<number | null>(null);
  const [limit, setLimit] = useState(limitUnits ? String(Math.round(limitUnits * 200)) : "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const onBreak = breakUntil && new Date(breakUntil).getTime() > Date.now();

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message });
      setAsk(null);
      if (r.ok) router.refresh();
    });

  return (
    <div className="space-y-6">
      {/* Take a break */}
      <div>
        <h3 className="font-extrabold">Take a break</h3>
        {onBreak ? (
          <p className="mt-1 rounded-2xl bg-amber-200/10 p-3 text-sm text-amber-50">
            You&apos;re on a break until <b>{fmt(breakUntil!)}</b>. Betting is paused; withdrawals still work. You can make the break longer, but not shorter.
          </p>
        ) : (
          <p className="mt-1 text-sm text-mist">Pause all betting (slips, challenges, paid leagues). It can&apos;t be undone early. Withdrawals keep working.</p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            [1, "24 hours"],
            [7, "7 days"],
            [30, "30 days"],
          ].map(([d, l]) => (
            <button
              key={d}
              type="button"
              disabled={pending}
              onClick={() => setAsk(Number(d))}
              className={`rounded-full border px-4 py-2 text-xs font-bold uppercase tracking-wider ${ask === d ? "border-lilac bg-lilac/20 text-white" : "border-white/20 text-white hover:bg-white/10"}`}
            >
              {l}
            </button>
          ))}
        </div>
        {ask !== null && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-sm">
            <span className="font-semibold text-amber-50">Pause betting for {ask === 1 ? "24 hours" : `${ask} days`}? You can&apos;t undo this.</span>
            <button type="button" disabled={pending} onClick={() => run(() => takeBreak(ask))} className="rounded-full bg-lilac px-4 py-1.5 text-xs font-extrabold uppercase text-ink">
              Yes, pause
            </button>
            <button type="button" onClick={() => setAsk(null)} className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-bold uppercase text-white">
              No
            </button>
          </div>
        )}
      </div>

      {/* Deposit limit */}
      <div>
        <h3 className="font-extrabold">Weekly deposit limit</h3>
        <p className="mt-1 text-sm text-mist">
          {limitUnits !== null
            ? <>Your limit: <b className="text-white">{etb(limitUnits)}</b> in any 7 days. Deposited in the last 7 days: <b className="text-white">{etb(deposited7d)}</b>.</>
            : "No limit set. Choose the most you want to deposit in any 7 days; our admin can't add more than that."}
        </p>
        {nextAt && (
          <p className="mt-1 text-xs text-amber-100">
            {nextUnits === null ? "Limit removal" : `New limit ${etb(nextUnits)}`} takes effect on {fmt(nextAt)} (7-day cooling-off).
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <input inputMode="numeric" value={limit} onChange={(e) => setLimit(e.target.value.replace(/\D/g, "").slice(0, 7))} placeholder="e.g. 5000" className={inputClass} />
          <button type="button" disabled={pending || !limit} onClick={() => run(() => saveDepositLimit(Number(limit)))} className="shrink-0 rounded-full bg-lilac px-5 text-xs font-bold uppercase tracking-wider text-ink disabled:opacity-40">
            Save
          </button>
        </div>
        <p className="mt-1 text-[11px] text-mist/70">Lowering takes effect now. Raising or removing it takes 7 days.</p>
        {limitUnits !== null && !(nextAt && nextUnits === null) && (
          <button type="button" disabled={pending} onClick={() => run(() => saveDepositLimit(null))} className="mt-2 text-xs font-bold uppercase tracking-wider text-mist hover:text-white">
            Remove limit (in 7 days)
          </button>
        )}
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-200" : "text-rose-200"}`}>{msg.text}</p>}
    </div>
  );
}
