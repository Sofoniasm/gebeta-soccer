"use client";

import { useEffect, useState } from "react";
import { etbLabel, unitsLabel } from "@/lib/money";

/**
 * The player's wallet balance, kept up to date by itself: checked again when
 * the tab or Mini App comes back into view, when the window gets focus, and
 * every 30 seconds while visible. So a bet placed in the Mini App also shows
 * in an open browser tab, without a reload.
 */
type Show = "units" | "etb" | "both";

let shared: number | null = null;
const listeners = new Set<(u: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let inflight = false;

async function check() {
  if (inflight || document.visibilityState !== "visible") return;
  inflight = true;
  try {
    const res = await fetch("/api/me/balance", { cache: "no-store" });
    if (res.ok) {
      const { units } = (await res.json()) as { units: number };
      if (Number.isFinite(units) && units !== shared) {
        shared = units;
        listeners.forEach((l) => l(units));
      }
    }
  } catch {
    /* offline: keep showing the last known balance */
  } finally {
    inflight = false;
  }
}

function subscribe(fn: (u: number) => void) {
  listeners.add(fn);
  if (listeners.size === 1) {
    timer = setInterval(check, 30_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    }
  };
}

export function LiveBalance({ initialUnits, show = "units" }: { initialUnits: number; show?: Show }) {
  const [units, setUnits] = useState(initialUnits);
  // A fresh page load (server value) wins over an older shared value.
  useEffect(() => {
    shared = initialUnits;
    setUnits(initialUnits);
  }, [initialUnits]);
  useEffect(() => subscribe(setUnits), []);
  if (show === "etb") return <>{etbLabel(units)}</>;
  if (show === "both") return <>{`${unitsLabel(units)} · ${etbLabel(units)}`}</>;
  return <>{unitsLabel(units)}</>;
}
