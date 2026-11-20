"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { inputClass } from "@/components/ui";
import { latestAdultBirthDate } from "@/lib/age";
import { saveDateOfBirth } from "./actions";

/** For players who signed up before date of birth was required. */
export function DobForm() {
  const router = useRouter();
  const [dob, setDob] = useState("");
  const [adult, setAdult] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} min="1900-01-01" max={latestAdultBirthDate()} className={`${inputClass} [color-scheme:dark]`} />
        <button
          type="button"
          disabled={!dob || !adult || pending}
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
      <label className="flex items-start gap-2 text-xs text-mist">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-violet-300" />
        <span>
          I am <b className="text-white">18 or older</b> and I accept the <Link href="/terms" className="underline">Terms</Link>.
        </span>
      </label>
      {msg && <p className={`text-xs ${msg.ok ? "text-emerald-200" : "text-rose-200"}`}>{msg.text}</p>}
    </div>
  );
}
