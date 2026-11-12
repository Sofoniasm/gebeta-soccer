"use client";

import Link from "next/link";
import { useActionState } from "react";
import { login, register, type AuthState } from "./actions";
import { Banner, inputClass, primaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { latestAdultBirthDate } from "@/lib/age";
import { localPath, type Lang } from "@/lib/i18n";
import { PAGES } from "@/lib/i18n/pages";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-mist">{label}</span>
      {children}
      {hint && <span className="block text-xs text-mist/70">{hint}</span>}
    </label>
  );
}

export function LoginForm({ next, lang = "en" }: { next?: string; lang?: Lang }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(login, undefined);
  const t = PAGES[lang].auth;
  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner kind="error">{state.error}</Banner>}
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field label={t.phone} hint={t.phoneHintLogin}>
        <input name="identifier" type="tel" inputMode="tel" autoComplete="tel" autoCapitalize="none" required className={inputClass} placeholder="0911 223 344" />
      </Field>
      <Field label={t.password}>
        <input name="password" type="password" autoComplete="current-password" required className={inputClass} placeholder="••••••••" />
      </Field>
      <p className="-mt-2 text-right text-xs">
        <Link href={localPath("/forgot", lang)} className="font-semibold text-lilac">{t.forgot}</Link>
      </p>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending && <SpinnerIcon size={18} />} {t.logIn}
      </button>
      <p className="text-center text-sm text-mist">
        {t.newHere}{" "}
        <Link href={next && next !== "/dashboard" ? `${localPath("/register", lang)}?next=${encodeURIComponent(next)}` : localPath("/register", lang)} className="font-semibold text-lilac">
          {t.createLink}
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ next, lang = "en" }: { next?: string; lang?: Lang }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(register, undefined);
  const t = PAGES[lang].auth;

  if (state?.success) {
    return (
      <div className="space-y-4">
        <Banner kind="success">{state.success}</Banner>
        <Link href={localPath("/login", lang)} className={primaryButtonClass}>
          {t.goLogin}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Banner kind="error">{state.error}</Banner>}
      {next && <input type="hidden" name="next" value={next} />}
      <Field label={t.phone} hint={t.phoneHintRegister}>
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required className={inputClass} placeholder="0911 223 344" />
      </Field>
      <Field label={t.password} hint={t.passwordHint}>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} placeholder="••••••••" />
      </Field>
      <Field label={t.dob} hint={t.dobHint}>
        <input name="date_of_birth" type="date" required min="1900-01-01" max={latestAdultBirthDate()} className={`${inputClass} [color-scheme:dark]`} />
      </Field>
      <Field label={t.displayName} hint={t.displayNameHint}>
        <input name="username" autoComplete="nickname" autoCapitalize="none" minLength={3} maxLength={24} className={inputClass} placeholder="abebe_10" />
      </Field>
      <Field label={t.email} hint={t.emailHint}>
        <input name="email" type="email" autoComplete="email" className={inputClass} placeholder="you@example.com" />
      </Field>
      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-ink/50 p-4 text-sm text-mist">
        <input name="age_ok" type="checkbox" required className="mt-0.5 h-5 w-5 shrink-0 accent-violet-300" />
        <span>
          {t.ageA}<b className="text-white">{t.ageB}</b>{t.ageC}
          <Link href={localPath("/terms", lang)} target="_blank" className="font-semibold text-lilac underline underline-offset-2">{t.terms}</Link>{t.ageD}
        </span>
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending && <SpinnerIcon size={18} />} {t.create}
      </button>
      <p className="text-center text-sm text-mist">
        {t.haveAccount}{" "}
        <Link href={localPath("/login", lang)} className="font-semibold text-lilac">
          {t.logIn}
        </Link>
      </p>
    </form>
  );
}
