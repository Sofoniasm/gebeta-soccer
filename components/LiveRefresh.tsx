"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Quietly reloads the page's data every `seconds` while the page is on screen,
 * so "You can win …" and the players count go up by themselves when someone
 * joins. Nothing typed is lost (forms keep their own state). Pauses while the
 * tab / Mini App is in the background.
 */
export function LiveRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const t = setInterval(tick, Math.max(10, seconds) * 1000);
    const onShow = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [router, seconds]);
  return null;
}
