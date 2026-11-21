"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner, inputClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { SURVIVOR_DAYS, SURVIVOR_MIN_PLAYERS, SURVIVOR_STAKES_ETB } from "@/lib/survivor";
import { createSurvivor } from "./actions";

const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm font-bold ${on ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist hover:text-white"}`;

/** Make a pool (stake, how many players, how many match days at most) or open one with a code. */
export function SurvivorLobby({ balanceEtb }: { balanceEtb: number }) {
  const router = useRouter();
  const [stake, setStake] = useState<number>(200);
  const [min, setMin] = useState<number>(3);
  const [days, setDays] = useState<number>(7);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const enough = balanceEtb >= stake;

  function create() {
    setErr(null);
    start(async () => {
      const r = await createSurvivor(stake, min, days);
      if (!r.ok || !r.code) return setErr(r.message);
      router.push(`/survivor/${r.code}`);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">Entry per player (ETB)</p>
        <div className="flex flex-wrap gap-2">
          {SURVIVOR_STAKES_ETB.map((v) => (
            <button key={v} type="button" onClick={() => setStake(v)} className={chip(stake === v)}>{v.toLocaleString("en-US")}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">Start when at least this many are in (max 20)</p>
        <div className="flex flex-wrap gap-2">
          {SURVIVOR_MIN_PLAYERS.map((v) => (
            <button key={v} type="button" onClick={() => setMin(v)} className={`h-11 min-w-11 px-3 ${chip(min === v)}`}>{v}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-widest text-mist">Longest game (match days)</p>
        <div className="flex flex-wrap gap-2">
          {SURVIVOR_DAYS.map((v) => (
            <button key={v} type="button" onClick={() => setDays(v)} className={`h-11 min-w-11 px-3 ${chip(days === v)}`}>{v}</button>
          ))}
        </div>
      </div>
      <p className="text-xs text-mist">
        Last one standing wins their entry back + 90% of everyone else&apos;s entries. Your balance: <b className="text-white">{balanceEtb.toLocaleString("en-US")} ETB</b>.
        {!enough && <span className="ml-1 text-amber-100">You need {(stake - balanceEtb).toLocaleString("en-US")} ETB more: ask the admin for a top-up.</span>}
      </p>
      {err && <Banner kind="error">{err}</Banner>}
      <button type="button" onClick={create} disabled={pending || !enough} className={`${primaryButtonClass} w-full justify-center disabled:opacity-50`}>
        {pending && <SpinnerIcon size={16} />} Create pool · {stake.toLocaleString("en-US")} ETB
      </button>

      <form
        className="flex gap-2 border-t border-white/5 pt-5"
        onSubmit={(e) => {
          e.preventDefault();
          const c = code.trim().toUpperCase();
          if (c) router.push(`/survivor/${encodeURIComponent(c)}`);
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Got a code? SV-XXXXXX" className={`${inputClass} uppercase placeholder:normal-case`} />
        <button className={`${secondaryButtonClass} shrink-0`}>Open</button>
      </form>
    </div>
  );
}
