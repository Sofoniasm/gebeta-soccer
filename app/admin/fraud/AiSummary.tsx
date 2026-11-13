"use client";

import { useState, useTransition } from "react";
import { summarizeFlag } from "./actions";

export function AiSummary({ userId }: { userId: string }) {
  const [pending, start] = useTransition();
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null);
  if (res) return <p className={`mt-2 rounded-xl bg-ink/50 p-3 text-xs ${res.ok ? "text-white" : "text-rose-300"}`}>{res.ok ? "✨ " : ""}{res.text}</p>;
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => start(async () => setRes(await summarizeFlag(userId)))}
      className="mt-2 rounded-full border border-lilac/40 bg-lilac/10 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-lilac/20 disabled:opacity-50"
    >
      {pending ? "Thinking…" : "✨ AI summary"}
    </button>
  );
}
