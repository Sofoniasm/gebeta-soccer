"use client";

import { useActionState, useState } from "react";
import { requestWithdrawal, type FormState } from "./actions";
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
