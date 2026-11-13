"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { initDataFromUrl, waitForWebApp } from "@/lib/tma";
import { Logo } from "@/components/Logo";
import { SpinnerIcon } from "@/components/icons";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

type State =
  | { kind: "loading" }
  | { kind: "browser" }
  | { kind: "unlinked"; firstName: string; sharing?: boolean; note?: string }
  | { kind: "error"; message: string };

const BOT = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "GebetaSoccerbot";

/**
 * Mini App entry: send Telegram's signed initData to our server. If this
 * Telegram account belongs to a player, the server logs them in and we go
 * straight to the dashboard — same account as the website.
 */
export function TmaEntry() {
  const router = useRouter();
  const params = useSearchParams();
  const nextParam = params.get("next");
  const next = nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";
  const [state, setState] = useState<State>({ kind: "loading" });

  /** One tap: share the Telegram phone number; the bot links it to the account with that number, then we sign in. */
  async function shareNumber() {
    const wa = window.Telegram?.WebApp;
    if (!wa?.requestContact) {
      setState((s) => (s.kind === "unlinked" ? { ...s, note: "Update Telegram to use this, or log in below." } : s));
      return;
    }
    setState((s) => (s.kind === "unlinked" ? { ...s, sharing: true, note: undefined } : s));
    wa.requestContact(async (shared) => {
      if (!shared) {
        setState((s) => (s.kind === "unlinked" ? { ...s, sharing: false, note: "No problem. You can log in below instead." } : s));
        return;
      }
      const initData = initDataFromUrl() ?? wa.initData;
      // The bot links the account a moment after the number arrives: try a few times.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 1200));
        try {
          const res = await fetch("/api/telegram/miniapp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) });
          const data = (await res.json()) as { status: string };
          if (data.status === "ok") {
            wa.HapticFeedback?.notificationOccurred("success");
            router.replace(next);
            router.refresh();
            return;
          }
        } catch {
          /* try again */
        }
      }
      setState((s) =>
        s.kind === "unlinked"
          ? { ...s, sharing: false, note: "We couldn't find a confirmed account with your Telegram number. Check the bot chat, or log in / create an account below." }
          : s,
      );
    });
  }

  useEffect(() => {
    document.documentElement.dataset.tmaReady = "1"; // the page's code is running (see the fallback in page.tsx)
    (async () => {
      // Signed data straight from the address works even before Telegram's script has loaded.
      const fromUrl = initDataFromUrl();
      const wa = fromUrl ? null : await waitForWebApp();
      const initData = fromUrl ?? wa?.initData ?? null;
      if (!initData) return setState({ kind: "browser" });
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 15000);
      try {
        const res = await fetch("/api/telegram/miniapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData }),
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        const data = (await res.json()) as { status: string; message?: string; firstName?: string; loggedIn?: boolean };
        if (data.status === "ok") {
          (wa ?? window.Telegram?.WebApp)?.HapticFeedback?.notificationOccurred("success");
          router.replace(next);
          router.refresh();
        } else if (data.status === "unlinked" && data.loggedIn) {
          router.replace("/tma/link");
        } else if (data.status === "unlinked") {
          setState({ kind: "unlinked", firstName: data.firstName ?? "" });
        } else {
          setState({ kind: "error", message: data.message ?? "Something went wrong." });
        }
      } catch {
        clearTimeout(timer);
        setState({ kind: "error", message: "The connection is too slow or was lost. Check your internet and try again." });
      }
    })();
  }, [router, next]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 py-10 text-center">
      <Logo size="lg" />

      {state.kind === "loading" && (
        <p className="flex items-center gap-2 text-sm text-mist">
          <SpinnerIcon size={16} /> Signing you in with Telegram…
        </p>
      )}

      {state.kind === "browser" && (
        <div className="max-w-sm space-y-4">
          <p className="text-sm text-mist">This page is the GebetaSoccer Telegram app. Open it from our bot, or use the website.</p>
          <a href={`https://t.me/${BOT}`} className={primaryButtonClass}>Open @{BOT}</a>
          <Link href="/dashboard" className={`${secondaryButtonClass} w-full justify-center`}>Continue on the website</Link>
        </div>
      )}

      {state.kind === "unlinked" && (
        <div className="w-full max-w-sm space-y-4">
          <div>
            <p className="text-xl font-extrabold">Welcome{state.firstName ? `, ${state.firstName}` : ""}! 👋</p>
            <p className="mt-1 text-sm text-mist">Connect your GebetaSoccer account once — next time the app opens straight to your picks.</p>
          </div>
          <button type="button" onClick={shareNumber} disabled={state.sharing} className={primaryButtonClass}>
            {state.sharing ? <><SpinnerIcon size={16} /> Linking your account…</> : "📱 Continue with my Telegram number"}
          </button>
          <p className="text-xs text-mist">Signed up on the website with this phone number? One tap links it, and the app opens straight into your account from then on.</p>
          {state.note && <p className="text-xs text-amber-100">{state.note}</p>}
          <Link href="/login?next=%2Ftma%2Flink" className={`${secondaryButtonClass} w-full justify-center`}>Log in with password</Link>
          <Link href="/register?next=%2Ftma%2Flink" className={`${secondaryButtonClass} w-full justify-center`}>Create a new account</Link>
          <p className="text-xs text-mist">Same account, wallet and picks as the website.</p>
        </div>
      )}

      {state.kind === "error" && (
        <div className="max-w-sm space-y-4">
          <p className="text-sm text-rose-200">{state.message}</p>
          <button onClick={() => location.reload()} className={primaryButtonClass}>Try again</button>
          <a href="/dashboard" target="_blank" rel="noopener" className={`${secondaryButtonClass} w-full justify-center`}>Open in the browser instead</a>
        </div>
      )}
    </main>
  );
}
