"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

/**
 * Shown instead of a blank / frozen page when something on a page crashes
 * (website, phone browser and the Telegram Mini App). The red text is the real
 * error, so a player can send a screenshot and we know what to fix.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({ message: error.message, stack: error.stack, digest: error.digest, kind: "boundary" });
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 py-10 text-center">
      <p className="text-5xl" aria-hidden="true">⚠️</p>
      <div className="max-w-sm">
        <h1 className="text-xl font-extrabold">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-mist">Tap Try again. If it keeps happening, send a screenshot of the red text to our support on Telegram.</p>
      </div>
      <pre className="max-h-40 w-full max-w-sm overflow-auto whitespace-pre-wrap rounded-2xl border border-rose-300/40 bg-rose-500/15 p-3 text-left text-[11px] text-rose-100">
        {error.message || "Unknown error"}
        {error.digest ? `\nCode: ${error.digest}` : ""}
      </pre>
      <div className="flex w-full max-w-sm flex-col gap-2">
        <button type="button" onClick={() => reset()} className="rounded-full bg-lilac px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink">
          Try again
        </button>
        <button type="button" onClick={() => window.location.reload()} className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold text-white">
          Reload the app
        </button>
        <a href="/dashboard" className="rounded-full px-6 py-3 text-sm font-bold text-lilac">
          Go to the Dashboard
        </a>
      </div>
    </main>
  );
}
