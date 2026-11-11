"use client";

import { useEffect, useState } from "react";

/** Animated number that counts up from 0 to `value` (ETB). */
export function CountUp({ value, durationMs = 1400, suffix = " ETB" }: { value: number; durationMs?: number; suffix?: string }) {
  const [shown, setShown] = useState(value);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || value <= 0) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out
      setShown(Math.round(value * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return (
    <span className="tabular-nums">
      {shown.toLocaleString("en-US")}
      {suffix}
    </span>
  );
}
