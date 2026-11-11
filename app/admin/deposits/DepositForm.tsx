"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { findPlayer, recordDeposit, type DepositState, type LookupState } from "./actions";
import { Banner, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SpinnerIcon, CheckIcon } from "@/components/icons";

const ETB_PER_UNIT = 200;
const QUICK = [1000, 2000, 3000, 5000, 10000];

export function DepositForm() {
  const [lookup, lookupAction, looking] = useActionState<LookupState, FormData>(findPlayer, undefined);
  const [result, depositAction, saving] = useActionState<DepositState, FormData>(recordDeposit, undefined);
  const [etb, setEtb] = useState("");

  const noteRef = useRef<HTMLInputElement>(null);

  // After a successful deposit: clear the amount so the same deposit can't be
  // submitted twice by accident. The player card shows the new balance.
  useEffect(() => {
    if (result?.ok) {
      setEtb("");
      if (noteRef.current) noteRef.current.value = "";
    }
  }, [result]);

  const units = Number(etb) > 0 ? Math.round((Number(etb) / ETB_PER_UNIT) * 100) / 100 : 0;
  const valid = units >= 5 && units <= 50;
  const p = lookup?.player;
  const balance = p && result?.ok && result.userId === p.id && result.newBalance !== undefined ? result.newBalance : p?.balance_units;

  return (
    <div className="space-y-5">
      {/* Step 1 — find player */}
      <form action={lookupAction} className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-lilac">1 · Find player</label>
        <div className="flex gap-2">
          <input name="identifier" required placeholder="Phone (0911…) or username" className={inputClass} autoComplete="off" />
          <button disabled={looking} className={`${secondaryButtonClass} shrink-0`}>
            {looking && <SpinnerIcon size={14} />} Find
          </button>
        </div>
        {lookup?.error && <Banner kind="error">{lookup.error}</Banner>}
      </form>

      {p && (
        <div className="flex items-center gap-3 rounded-2xl border border-lilac/30 bg-lilac/10 p-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-lilac text-lg font-extrabold text-ink">
            {p.username.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-extrabold">{p.username}</p>
            <p className="text-xs text-mist">{p.phone_number ?? "no phone"}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Balance</p>
            <p className="font-extrabold">{balance} Units</p>
          </div>
        </div>
      )}

      {/* Step 2 — amount */}
      {p && (
        <form
          action={depositAction}
          onSubmit={(e: React.FormEvent<HTMLFormElement>) => {
            if (!window.confirm(`Add ${units} Units (${Number(etb).toLocaleString("en-US")} ETB) to ${p.username}?`)) e.preventDefault();
          }}
          className="space-y-3"
        >
          <input type="hidden" name="userId" value={p.id} />
          <label className="text-xs font-bold uppercase tracking-widest text-lilac">2 · Amount received (ETB)</label>
          <input
            name="etb"
            type="number"
            inputMode="numeric"
            min={1000}
            max={10000}
            step={100}
            required
            value={etb}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEtb(e.target.value)}
            placeholder="e.g. 5000"
            className={`${inputClass} text-2xl font-extrabold`}
          />
          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                type="button"
                key={q}
                onClick={() => setEtb(String(q))}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-mist hover:border-lilac hover:text-white"
              >
                {q.toLocaleString("en-US")}
              </button>
            ))}
          </div>
          <div className={`rounded-2xl p-4 text-center ${valid ? "bg-ink/70" : "bg-ink/40"}`}>
            <p className="text-[10px] font-bold uppercase tracking-widest text-mist">Player receives</p>
            <p className={`text-3xl font-extrabold ${valid ? "text-lilac-soft" : "text-mist/50"}`}>{units || 0} Units</p>
            {etb && !valid && <p className="mt-1 text-xs text-rose-200">Must be 1,000 – 10,000 ETB (5 – 50 Units)</p>}
          </div>
          <input ref={noteRef} name="note" placeholder="Note (optional, e.g. Telebirr ref)" className={inputClass} autoComplete="off" />
          {result?.message && (
            <Banner kind={result.ok ? "success" : "error"}>
              {result.ok && <CheckIcon size={14} className="mr-1 inline" />}
              {result.message}
              {result.ok && result.newBalance !== undefined && ` New balance: ${result.newBalance} Units.`}
            </Banner>
          )}
          <button disabled={saving || !valid} className={primaryButtonClass}>
            {saving && <SpinnerIcon size={16} />} Confirm deposit
          </button>
        </form>
      )}
    </div>
  );
}
