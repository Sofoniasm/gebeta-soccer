"use client";

import { useEffect } from "react";

/** Quietly asks the server to refresh the match data when it is stale (at most once every 10 minutes per browser). */
export function SyncKick() {
  useEffect(() => {
    try {
      const last = Number(localStorage.getItem("sync-kick") ?? 0);
      if (Date.now() - last < 10 * 60 * 1000) return;
      localStorage.setItem("sync-kick", String(Date.now()));
    } catch {
      /* private mode: just ask */
    }
    const t = setTimeout(() => {
      void fetch("/api/sync-kick", { method: "POST" }).catch(() => undefined);
    }, 4000);
    return () => clearTimeout(t);
  }, []);
  return null;
}
