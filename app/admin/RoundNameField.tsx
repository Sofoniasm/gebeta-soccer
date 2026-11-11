"use client";

import { useState } from "react";
import { inputClass } from "@/components/ui";

const day = () =>
  new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short" }).format(new Date());

/** Round name with one-tap suggestions for daily rounds. */
export function RoundNameField() {
  const [name, setName] = useState("");
  const d = day();
  const ideas = [`Today's 10 · ${d}`, `Morning Round · ${d}`, `Evening Round · ${d}`, `Weekend 10 · ${d}`];
  return (
    <div className="space-y-2">
      <input name="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder={`Today's 10 · ${d}`} className={inputClass} />
      <div className="flex flex-wrap gap-1.5">
        {ideas.map((i) => (
          <button key={i} type="button" onClick={() => setName(i)} className="rounded-full border border-white/10 px-3 py-1 text-[11px] font-bold text-mist hover:border-lilac/50 hover:text-white">
            {i}
          </button>
        ))}
      </div>
    </div>
  );
}
