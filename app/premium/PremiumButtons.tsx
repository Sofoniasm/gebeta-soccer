"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { buyPremium, setAutoRenew } from "./actions";
import type { Plan } from "@/lib/premium";

export function BuyButton({ plan, label, disabled }: { plan: Plan; label: string; disabled?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending || disabled}
        onClick={() => {
          if (!confirm(`${label}? The Units come out of your wallet now.`)) return;
          start(async () => {
            const r = await buyPremium(plan);
            setMsg({ ok: r.ok, text: r.message });
            if (r.ok) router.refresh();
          });
        }}
        className="w-full rounded-full bg-lilac px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft disabled:opacity-40"
      >
        {pending ? "Paying…" : label}
      </button>
      {msg && <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-200" : "text-rose-200"}`}>{msg.text}</p>}
    </div>
  );
}

export function AutoRenewToggle({ on }: { on: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await setAutoRenew(!on);
            setMsg(r.message);
            if (r.ok) router.refresh();
          })
        }
        className="rounded-full border border-white/30 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10 disabled:opacity-40"
      >
        {on ? "Turn off auto-renew" : "Turn on auto-renew"}
      </button>
      {msg && <span className="text-xs text-mist">{msg}</span>}
    </div>
  );
}
