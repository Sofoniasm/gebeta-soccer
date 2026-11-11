"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons";
import { primaryButtonClass } from "@/components/ui";

interface Item {
  id: number;
  label: string;
  when: string;
  competition: string | null;
}

function AddButton({ n, room }: { n: number; room: number }) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending || n === 0 || n > room} className={`${primaryButtonClass} sm:w-auto`}>
      {pending && <SpinnerIcon size={16} />}
      {n === 0 ? "Tick matches to add" : `Add ${n} match${n === 1 ? "" : "es"}`}
    </button>
  );
}

/** Upcoming matches (soonest first). You can't tick more than the round has room for (10 in total). */
export function MatchPicker({
  roundId,
  room,
  matches,
  action,
}: {
  roundId: number;
  room: number;
  matches: Item[];
  action: (formData: FormData) => void | Promise<void>;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const full = picked.size >= room;

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="roundId" value={roundId} />
      <p className="text-xs text-mist">
        Sorted by kickoff. Ticked <b className="text-white">{picked.size}</b> of the <b className="text-white">{room}</b> still needed.
      </p>
      <div className="max-h-96 space-y-1 overflow-y-auto rounded-2xl border border-white/5 bg-ink/40 p-2">
        {matches.map((m) => {
          const on = picked.has(m.id);
          const blocked = !on && full;
          return (
            <label
              key={m.id}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${blocked ? "cursor-not-allowed opacity-40" : "cursor-pointer hover:bg-white/5"} ${on ? "bg-lilac/10" : ""}`}
            >
              <input
                type="checkbox"
                name="matchId"
                value={m.id}
                checked={on}
                disabled={blocked}
                onChange={() =>
                  setPicked((prev) => {
                    const next = new Set(prev);
                    if (next.has(m.id)) next.delete(m.id);
                    else if (next.size < room) next.add(m.id);
                    return next;
                  })
                }
                className="h-4 w-4 accent-violet-300"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold">{m.label}</span>
              {m.competition && <span className="hidden text-[10px] font-bold uppercase text-mist/70 sm:inline">{m.competition}</span>}
              <span className="shrink-0 text-xs text-mist">{m.when}</span>
            </label>
          );
        })}
      </div>
      <AddButton n={picked.size} room={room} />
    </form>
  );
}
