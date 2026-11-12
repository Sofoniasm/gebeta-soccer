"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, resetPassword, type AuthState } from "./actions";
import { Banner, inputClass, primaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { localPath, type Lang } from "@/lib/i18n";
import { PAGES } from "@/lib/i18n/pages";

export function ForgotForm({ lang = "en", supportUrl }: { lang?: Lang; supportUrl: string }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(requestPasswordReset, undefined);
  const t = PAGES[lang].auth;
  if (state?.success) {
    return (
      <div className="space-y-4">
        <Banner kind="success">{state.success}</Banner>
        <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="block text-center text-sm font-semibold text-lilac">
          {t.support}
        </a>
        <Link href={localPath("/login", lang)} className={primaryButtonClass}>{t.goLogin}</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      {state?.error && <Banner kind="error">{state.error}</Banner>}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-mist">{t.phone}</span>
        <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required className={inputClass} placeholder="0911 223 344" />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending && <SpinnerIcon size={18} />} {t.sendLink}
      </button>
      <p className="text-center text-sm text-mist">
        <Link href={localPath("/login", lang)} className="font-semibold text-lilac">{t.goLogin}</Link>
      </p>
    </form>
  );
}

export function ResetForm({ token, lang = "en" }: { token: string; lang?: Lang }) {
  const [state, action, pending] = useActionState<AuthState, FormData>(resetPassword, undefined);
  const t = PAGES[lang].auth;
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="lang" value={lang} />
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <Banner kind="error">
          {state.error}{" "}
          {state.error === t.resetBadLink && <Link href={localPath("/forgot", lang)} className="font-bold underline">{t.askNew}</Link>}
        </Banner>
      )}
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-mist">{t.newPassword}</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} placeholder="••••••••" />
        <span className="block text-xs text-mist/70">{t.passwordHint}</span>
      </label>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium text-mist">{t.confirmPassword}</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className={inputClass} placeholder="••••••••" />
      </label>
      <button type="submit" disabled={pending} className={primaryButtonClass}>
        {pending && <SpinnerIcon size={18} />} {t.savePassword}
      </button>
    </form>
  );
}
