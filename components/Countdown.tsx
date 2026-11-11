"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Live countdown to an ISO time, e.g. the next kickoff (when predictions lock). */
export function Countdown({ to, label = "Next lock in" }: { to: string; label?: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (now === null) return null; // avoid server/client mismatch
  const left = target - now;
  if (left <= 0) return <span className="text-xs font-bold uppercase tracking-widest text-rose-200">Locked</span>;
  const { d, h, m, s } = parts(left);
  const cells = d > 0 ? [[d, "d"], [h, "h"], [m, "m"]] : [[h, "h"], [m, "m"], [s, "s"]];

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{label}</span>
      <div className="flex gap-1">
        {cells.map(([v, u]) => (
          <span key={u} className="min-w-[2.6rem] rounded-xl bg-ink px-2 py-1 text-center text-sm font-extrabold tabular-nums text-lilac-soft">
            {String(v).padStart(2, "0")}
            <span className="text-[10px] text-mist">{u}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
