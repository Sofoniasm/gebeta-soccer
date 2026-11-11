"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { waitForWebApp } from "@/lib/tma";
import { Logo } from "@/components/Logo";
import { SpinnerIcon } from "@/components/icons";
import { primaryButtonClass, secondaryButtonClass } from "@/components/ui";

type State =
  | { kind: "loading" }
  | { kind: "browser" }
  | { kind: "unlinked"; firstName: string }
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

  useEffect(() => {
    (async () => {
      const wa = await waitForWebApp();
      if (!wa) return setState({ kind: "browser" });
      try {
        const res = await fetch("/api/telegram/miniapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ initData: wa.initData }),
        });
        const data = (await res.json()) as { status: string; message?: string; firstName?: string; loggedIn?: boolean };
        if (data.status === "ok") {
          wa.HapticFeedback?.notificationOccurred("success");
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
        setState({ kind: "error", message: "No connection. Check your internet and try again." });
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
          <Link href="/login?next=%2Ftma%2Flink" className={primaryButtonClass}>I have an account — log in</Link>
          <Link href="/register?next=%2Ftma%2Flink" className={`${secondaryButtonClass} w-full justify-center`}>Create a new account</Link>
          <p className="text-xs text-mist">Same account, wallet and picks as the website.</p>
        </div>
      )}

      {state.kind === "error" && (
        <div className="max-w-sm space-y-4">
          <p className="text-sm text-rose-200">{state.message}</p>
          <button onClick={() => location.reload()} className={primaryButtonClass}>Try again</button>
        </div>
      )}
    </main>
  );
}
