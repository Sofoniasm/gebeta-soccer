"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { DAMA_STAKES_ETB } from "@/lib/dama";
import { createDama } from "./actions";

/** Make a game (pick the stake) or open one with a code. */
export function DamaLobby({ balanceEtb }: { balanceEtb: number }) {
  const router = useRouter();
  const [stake, setStake] = useState<number>(200);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const enough = balanceEtb >= stake;

  function create() {
    setErr(null);
    start(async () => {
      const r = await createDama(stake);
      if (!r.ok || !r.code) return setErr(r.message);
      router.push(`/dama/${r.code}`);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">Stake (ETB, each player)</p>
        <div className="flex flex-wrap gap-2">
          {DAMA_STAKES_ETB.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setStake(v)}
              className={`rounded-full border px-4 py-2 text-sm font-bold ${stake === v ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist hover:text-white"}`}
            >
              {v.toLocaleString("en-US")}
            </button>
          ))}
        </div>
      </div>
      <p className="text-xs text-mist">
        Winner gets their stake back + 90% of the opponent&apos;s stake. A draw returns both stakes. Your balance: <b className="text-white">{balanceEtb.toLocaleString("en-US")} ETB</b>.
        {!enough && <span className="ml-1 text-amber-100">You need {(stake - balanceEtb).toLocaleString("en-US")} ETB more: ask the admin for a top-up.</span>}
      </p>
      {err && <Banner kind="error">{err}</Banner>}
      <button type="button" onClick={create} disabled={pending || !enough} className={`${primaryButtonClass} w-full justify-center disabled:opacity-50`}>
        {pending && <SpinnerIcon size={16} />} Create game · {stake.toLocaleString("en-US")} ETB
      </button>
      <form
        className="flex gap-2 border-t border-white/5 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (c) router.push(`/dama/${encodeURIComponent(c)}`);
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Got a code? DM-XXXXXX" className={`${inputClass} uppercase placeholder:normal-case`} />
        <button className={`${secondaryButtonClass} shrink-0`}>Open</button>
      </form>
    </div>
  );
}
