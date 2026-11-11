"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inputClass } from "@/components/ui";
import { latestAdultBirthDate } from "@/lib/age";
import { saveDateOfBirth } from "./actions";

/** For players who signed up before date of birth was required. */
export function DobForm() {
  const router = useRouter();
  const [dob, setDob] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} min="1900-01-01" max={latestAdultBirthDate()} className={`${inputClass} [color-scheme:dark]`} />
        <button
          type="button"
          disabled={!dob || pending}
          onClick={() =>
            start(async () => {
              const r = await saveDateOfBirth(dob);
              setMsg({ ok: r.ok, text: r.message });
              if (r.ok) router.refresh();
            })
          }
          className="shrink-0 rounded-full bg-lilac px-5 text-xs font-bold uppercase tracking-wider text-ink disabled:opacity-40"
        >
          Save
        </button>
      </div>
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-200" : "text-rose-200"}`}>{msg.text}</p>}
    </div>
  );
}
