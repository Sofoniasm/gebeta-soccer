"use client";

import { useState } from "react";
import type { FormItem } from "@/lib/form";

const COLOR = { W: "bg-emerald-400", D: "bg-amber-300", L: "bg-rose-400" } as const;
const WORD = { W: "Won", D: "Drew", L: "Lost" } as const;

/** Last 5 results as small blocks (green win, yellow draw, red loss). Tap to see the scores. */
export function FormBar({ team, form }: { team: string; form: FormItem[] | undefined }) {
  const [open, setOpen] = useState(false);
  if (!form || form.length === 0) return <span className="h-2.5 text-[10px] leading-none text-mist/50">no form yet</span>;
  return (
    <span className="relative inline-flex flex-col items-center">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${team} last ${form.length}: ${form.map((f) => WORD[f.r]).join(", ")}. Tap for scores.`}
        aria-expanded={open}
        className="flex gap-[3px] rounded p-0.5 hover:bg-white/5"
      >
        {form.map((f, i) => (
          <span key={i} title={`${WORD[f.r]} ${f.t}`} className={`h-2.5 w-2.5 rounded-[3px] ${COLOR[f.r]}`} />
        ))}
      </button>
      {open && (
        <span className="absolute top-5 z-20 w-56 rounded-xl border border-white/10 bg-[#0b0912] p-2 text-left text-[11px] text-mist shadow-xl">
          {[...form].reverse().map((f, i) => (
            <span key={i} className="flex items-center gap-1.5 py-0.5">
              <span className={`h-2 w-2 shrink-0 rounded-sm ${COLOR[f.r]}`} />
              <span className="truncate">{f.t}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}
