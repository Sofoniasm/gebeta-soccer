"use client";

import { useActionState } from "react";
import { changePassword, type FormState } from "./actions";
import { Banner, inputClass, primaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";

export function PasswordForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(changePassword, undefined);
  return (
    <form action={action} className="space-y-3">
      {state?.message && <Banner kind={state.ok ? "success" : "error"}>{state.message}</Banner>}
      <input name="password" type="password" autoComplete="new-password" required minLength={8} placeholder="New password" className={inputClass} />
      <input name="confirm" type="password" autoComplete="new-password" required minLength={8} placeholder="Repeat new password" className={inputClass} />
      <button disabled={pending} className={`${primaryButtonClass} sm:w-auto`}>
        {pending && <SpinnerIcon size={16} />} Change password
      </button>
    </form>
  );
}
