"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { confirmCode, sendCode, type VerifyState } from "./actions";
import { Banner, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";

/** Re-checks every few seconds so the page moves on as soon as Telegram confirms. */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [router]);
  return null;
}

export function SmsForm() {
  const [sent, sendAction, sending] = useActionState<VerifyState, FormData>(sendCode, undefined);
  const [checked, checkAction, checking] = useActionState<VerifyState, FormData>(confirmCode, undefined);
  return (
    <div className="space-y-3">
      <form action={sendAction}>
        <button disabled={sending} className={`${secondaryButtonClass} w-full py-3`}>
          {sending && <SpinnerIcon size={14} />} {sent?.ok ? "Send a new code" : "Send me an SMS code"}
        </button>
      </form>
      {sent?.message && <Banner kind={sent.ok ? "success" : "error"}>{sent.message}</Banner>}
      {sent?.ok && (
        <form action={checkAction} className="space-y-3">
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="6-digit code"
            className={`${inputClass} text-center text-2xl font-extrabold tracking-[0.5em]`}
          />
          {checked?.message && <Banner kind="error">{checked.message}</Banner>}
          <button disabled={checking} className={primaryButtonClass}>
            {checking && <SpinnerIcon size={16} />} Confirm code
          </button>
        </form>
      )}
    </div>
  );
}
