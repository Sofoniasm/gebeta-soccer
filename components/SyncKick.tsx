"use client";

import { useEffect } from "react";

/**
 * Quietly pings the server while the app is open: it refreshes stale match data and lets the House Bot join waiting
 * chess games (every 2 minutes, only while the tab is visible). Costs one tiny request when nothing is due.
 */
export function SyncKick() {
  useEffect(() => {
    const ping = () => {
      if (document.visibilityState === "hidden") return;
      void fetch("/api/sync-kick", { method: "POST" }).catch(() => undefined);
    };
    const first = setTimeout(ping, 4000);
    const every = setInterval(ping, 2 * 60 * 1000);
    return () => {
      clearTimeout(first);
      clearInterval(every);
    };
  }, []);
  return null;
}
