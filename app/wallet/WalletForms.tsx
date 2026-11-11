"use client";

import { useActionState } from "react";
import { requestWithdrawal, type FormState } from "./actions";
import { Banner, inputClass, primaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";

export function WithdrawForm({ defaultPhone, maxUnits }: { defaultPhone: string; maxUnits: number }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestWithdrawal, undefined);
  return (
    <form action={action} className="space-y-3">
      {state?.message && <Banner kind={state.ok ? "success" : "error"}>{state.message}</Banner>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-mist">Units to withdraw (1 unit = 200 ETB)</span>
          <input name="units" type="number" min={1} max={Math.max(1, Math.floor(maxUnits))} step="1" defaultValue={1} required className={inputClass} />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-mist">Your phone number</span>
          <input name="phone" type="tel" inputMode="tel" defaultValue={defaultPhone} required className={inputClass} />
        </label>
      </div>
      <button disabled={pending || maxUnits < 1} className={`${primaryButtonClass} sm:w-auto`}>
        {pending && <SpinnerIcon size={16} />} Request withdrawal
      </button>
      {maxUnits < 1 && <p className="text-xs text-mist">You need at least 1 unit to withdraw.</p>}
    </form>
  );
}
