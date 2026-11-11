"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthState } from "./actions";
import { Banner, inputClass, primaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-mist">{label}</span>
      {children}
      {hint && <span className="block text-xs text-mist/70">{hint}</span>}
    </label>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, undefined);
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner kind="error">{state.error}</Banner>}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field label="Username or phone number">
        <input name="identifier" autoComplete="username" autoCapitalize="none" required className={inputClass} placeholder="abebe_10 or 0911 223 344" />
      </Field>
      <Field label="Password">
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} placeholder="••••••••" />
      </Field>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending && <SpinnerIcon size={18} />} Log in
      </button>
      <p className="text-center text-sm text-mist">
        New here?{" "}
        <Link href="/register" className="font-semibold text-lilac">
          Create an account
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(register, undefined);

  if (state?.success) {
    return (
      <div className="space-y-4">
        <Banner kind="success">{state.success}</Banner>
        <Link href="/login" className={primaryButtonClass}>
          Go to login
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner kind="error">{state.error}</Banner>}
      <Field label="Username" hint="Shown on leaderboards. Letters, numbers, _">
        <input name="username" autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={24} className={inputClass} placeholder="abebe_10" />
      </Field>
      <Field label="Phone number" hint="Used to log in and to match your Telebirr deposits.">
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required className={inputClass} placeholder="0911 223 344" />
      </Field>
      <Field label="Email (optional)" hint="Lets you recover your account if you forget your password.">
        <input name="email" type="email" autoComplete="email" className={inputClass} placeholder="you@example.com" />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} placeholder="••••••••" />
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-ink/50 p-4 text-sm text-mist">
        <input name="age_ok" type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 accent-violet-300" />
        <span>
          I confirm I am <b className="text-white">18 years or older</b> and I accept the{" "}
          <Link href="/terms" target="_blank" className="font-semibold text-lilac underline underline-offset-2">Terms &amp; Responsible Play</Link> rules.
        </span>
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending && <SpinnerIcon size={18} />} Create account
      </button>
      <p className="text-center text-sm text-mist">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-lilac">
          Log in
        </Link>
      </p>
    </form>
  );
}
