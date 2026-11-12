"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { confirmResetCode, requestResetCode, type ForgotState } from "./actions";
import { Banner, inputClass, primaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { localPath, type Lang } from "@/lib/i18n";
import { PAGES } from "@/lib/i18n/pages";

/**
 * Forgot password, two steps on one page:
 *  1. phone number -> the bot sends a 6-digit code on Telegram
 *  2. code + new password (wrong codes are rejected; 5 tries)
 */
export function ForgotForm({ lang = "en", supportUrl }: { lang?: Lang; supportUrl: string }) {
  const t = PAGES[lang].auth;
  const [sendState, sendAction, sending] = useActionState<ForgotState, FormData>(requestResetCode, undefined);
  const [confirmState, confirmAction, confirming] = useActionState<ForgotState, FormData>(confirmResetCode, undefined);
  const [restart, setRestart] = useState(0);
  const onCodeStep = sendState?.stage === "code" && restart === 0;
  const phone = confirmState?.phone ?? sendState?.phone ?? "";

  if (!onCodeStep) {
    return (
      <form action={(fd) => { setRestart(0); return sendAction(fd); }} className="space-y-4">
        <input type="hidden" name="lang" value={lang} />
        {sendState?.error && <Banner kind="error">{sendState.error}</Banner>}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-mist">{t.phone}</span>
          <input name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={phone} className={inputClass} placeholder="0911 223 344" />
        </label>
        <button type="submit" disabled={sending} className={primaryButtonClass}>
          {sending && <SpinnerIcon size={18} />} {t.sendLink}
        </button>
        <p className="flex justify-between text-sm">
          <Link href={localPath("/login", lang)} className="font-semibold text-lilac">{t.goLogin}</Link>
          <a href={supportUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-mist hover:text-white">{t.support}</a>
        </p>
      </form>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-lilac/30 bg-lilac/10 p-4 text-sm">
        <p className="font-extrabold text-white">📲 {t.codeSentTitle}</p>
        <p className="mt-1 text-mist">{sendState?.info}</p>
      </div>
      <form action={confirmAction} className="space-y-4">
        <input type="hidden" name="lang" value={lang} />
        <input type="hidden" name="phone" value={phone} />
        {confirmState?.error && <Banner kind="error">{confirmState.error}</Banner>}
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-mist">{t.code}</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            className={`${inputClass} text-center font-mono text-2xl tracking-[0.5em]`}
            placeholder="••••••"
          />
          <span className="block text-xs text-mist/70">{t.codeHint}</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-mist">{t.newPassword}</span>
          <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} placeholder="••••••••" />
          <span className="block text-xs text-mist/70">{t.passwordHint}</span>
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium text-mist">{t.confirmPassword}</span>
          <input name="confirm" type="password" autoComplete="new-password" required minLength={8} className={inputClass} placeholder="••••••••" />
        </label>
        <button type="submit" disabled={confirming} className={primaryButtonClass}>
          {confirming && <SpinnerIcon size={18} />} {t.savePassword}
        </button>
      </form>
      <div className="flex justify-between text-sm">
        <form action={sendAction}>
          <input type="hidden" name="lang" value={lang} />
          <input type="hidden" name="phone" value={phone} />
          <button type="submit" disabled={sending} className="font-semibold text-lilac">{t.newCode}</button>
        </form>
        <button type="button" onClick={() => setRestart((n) => n + 1)} className="font-semibold text-mist hover:text-white">{t.otherPhone}</button>
      </div>
    </div>
  );
}
