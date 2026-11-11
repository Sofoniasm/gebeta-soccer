"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { waitForWebApp } from "@/lib/tma";
import { Logo } from "@/components/Logo";
import { SpinnerIcon } from "@/components/icons";
import { primaryButtonClass } from "@/components/ui";

/**
 * After logging in (or registering + confirming the phone) inside the Mini App,
 * connect this Telegram account to the GebetaSoccer account, then go play.
 */
export default function TmaLinkPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const wa = await waitForWebApp();
      if (!wa) {
        router.replace("/dashboard"); // opened in a normal browser: nothing to link
        return;
      }
      const res = await fetch("/api/telegram/miniapp/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: wa.initData }),
      }).catch(() => null);
      const data = res ? ((await res.json().catch(() => ({}))) as { status?: string; message?: string }) : { message: "No connection." };
      if (data.status === "ok") {
        wa.HapticFeedback?.notificationOccurred("success");
        router.replace("/dashboard");
      } else if (data.status === "login") {
        router.replace("/login?next=%2Ftma%2Flink");
      } else if (data.status === "verify") {
        router.replace("/verify?next=%2Ftma%2Flink");
      } else {
        setError(data.message ?? "Could not link your Telegram account.");
      }
    })();
  }, [router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 px-6 text-center">
      <Logo size="lg" />
      {error ? (
        <div className="max-w-sm space-y-4">
          <p className="text-sm text-rose-200">{error}</p>
          <Link href="/dashboard" className={primaryButtonClass}>Continue to GebetaSoccer</Link>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-mist">
          <SpinnerIcon size={16} /> Connecting your Telegram…
        </p>
      )}
    </main>
  );
}
