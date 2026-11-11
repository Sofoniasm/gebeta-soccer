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
  kickoff?: string;
}

const TZ = "Africa/Addis_Ababa";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayName = (iso: string) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));

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
  // Day filter (Ethiopia time): Today / Tomorrow / other days
  const today = dayKey(new Date().toISOString());
  const tomorrow = dayKey(new Date(Date.now() + 86400000).toISOString());
  const days = Array.from(new Set(matches.map((m) => (m.kickoff ? dayKey(m.kickoff) : "")).filter(Boolean)));
  const [day, setDay] = useState<string>(days.includes(today) ? today : "all");
  const label = (k: string) => (k === today ? "Today" : k === tomorrow ? "Tomorrow" : dayName(`${k}T12:00:00+03:00`));
  const shown = day === "all" ? matches : matches.filter((m) => (m.kickoff ? dayKey(m.kickoff) : "") === day || picked.has(m.id));

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="roundId" value={roundId} />
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {["all", ...days].map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setDay(k)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-bold ${day === k ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}
          >
            {k === "all" ? "All days" : label(k)} {k !== "all" && <span className="text-mist">({matches.filter((m) => m.kickoff && dayKey(m.kickoff) === k).length})</span>}
          </button>
        ))}
      </div>
      <p className="text-xs text-mist">
        Only matches that haven&apos;t started are listed. Sorted by kickoff. Ticked <b className="text-white">{picked.size}</b> of the <b className="text-white">{room}</b> still needed.
      </p>
      <div className="max-h-96 space-y-1 overflow-y-auto rounded-2xl border border-white/5 bg-ink/40 p-2">
        {shown.length === 0 && <p className="p-3 text-sm text-mist">No matches on this day. Try another day or sync matches.</p>}
        {shown.map((m) => {
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
