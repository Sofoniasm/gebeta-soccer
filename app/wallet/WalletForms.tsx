"use client";

import { useActionState, useEffect, useState } from "react";
import { requestWithdrawal, startCryptoDeposit, type CryptoState, type FormState } from "./actions";
import { Banner, inputClass, primaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";

export function WithdrawForm({ defaultPhone, maxUnits }: { defaultPhone: string; maxUnits: number }) {
  // maxUnits = balance minus the 1 Unit that always stays in the account
  const [state, action, pending] = useActionState<FormState, FormData>(requestWithdrawal, undefined);
  const [units, setUnits] = useState(maxUnits >= 1 ? "1" : "");
  const canWithdraw = maxUnits >= 1;
  const etb = Number(units) > 0 ? (Number(units) * 200).toLocaleString("en-US") : "0";
  return (
    <form action={action} className="space-y-3">
      {state?.message && <Banner kind={state.ok ? "success" : "error"}>{state.message}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-mist">Units to withdraw (1 unit = 200 ETB)</span>
          <div className="flex gap-2">
            <input
              name="units"
              type="number"
              min={1}
              max={Math.max(1, maxUnits)}
              step="0.5"
              value={units}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUnits(e.target.value)}
              required
              className={inputClass}
            />
            <button
              type="button"
              disabled={!canWithdraw}
              onClick={() => setUnits(String(maxUnits))}
              className="shrink-0 rounded-full border border-white/15 px-3 text-xs font-bold uppercase tracking-wider text-mist hover:border-lilac hover:text-white disabled:opacity-40"
            >
              Max
            </button>
          </div>
          <span className="block text-xs text-mist">= {etb} ETB</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-mist">Your phone number</span>
          <input name="phone" type="tel" inputMode="tel" defaultValue={defaultPhone} required className={inputClass} />
        </label>
      </div>
      <button disabled={pending || !canWithdraw} className={`${primaryButtonClass} sm:w-auto`}>
        {pending && <SpinnerIcon size={16} />} Request withdrawal
      </button>
      <p className="text-xs text-mist">
        {canWithdraw
          ? `You can withdraw up to ${maxUnits.toLocaleString("en-US")} Units (${(maxUnits * 200).toLocaleString("en-US")} ETB). 1 Unit (200 ETB) always stays in your account to keep it open.`
          : "You need more than 1 Unit to withdraw — 1 Unit (200 ETB) always stays in your account."}
      </p>
    </form>
  );
}

/** Pay with USDT (AuraPay): pick Units + network, then go to AuraPay's checkout page. */
export function CryptoDepositForm({ usdPerUnit, min, max }: { usdPerUnit: number; min: number; max: number }) {
  const [state, action, pending] = useActionState<CryptoState, FormData>(startCryptoDeposit, undefined);
  const [units, setUnits] = useState(String(min));
  const [chain, setChain] = useState<"TRON" | "TON">("TRON");
  useEffect(() => {
    if (state?.ok && state.url) window.location.href = state.url;
  }, [state]);
  const n = Number(units);
  const usd = n > 0 ? Math.ceil(Math.round(n * usdPerUnit * 10000) / 100) / 100 : 0;
  return (
    <form action={action} className="space-y-3">
      {state?.message && <Banner kind={state.ok ? "success" : "error"}>{state.message}</Banner>}
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold text-mist">Units to add ({min}–{max})</span>
        <input
          name="units"
          type="number"
          min={min}
          max={max}
          step="0.5"
          value={units}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUnits(e.target.value)}
          required
          className={inputClass}
        />
        <span className="block text-xs text-mist">
          You pay <b className="text-white">{usd.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDT</b> · 1 Unit = {usdPerUnit} USDT
        </span>
      </label>
      <div className="grid grid-cols-2 gap-2">
        {(["TRON", "TON"] as const).map((c) => (
          <label
            key={c}
            className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 text-sm font-bold ${chain === c ? "border-lilac bg-lilac/15 text-white" : "border-white/10 text-mist hover:border-white/30"}`}
          >
            <input type="radio" name="chain" value={c} checked={chain === c} onChange={() => setChain(c)} className="sr-only" />
            USDT · {c === "TRON" ? "TRON (TRC-20)" : "TON"}
          </label>
        ))}
      </div>
      <button disabled={pending || (state?.ok && !!state.url)} className={`${primaryButtonClass} sm:w-auto`}>
        {(pending || (state?.ok && state.url)) && <SpinnerIcon size={16} />} Pay with crypto
      </button>
      <p className="text-xs text-mist">Your Units are added automatically a few minutes after the payment is confirmed on the blockchain.</p>
    </form>
  );
}
