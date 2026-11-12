/**
 * Time slots for automatic rounds, in Ethiopian time (EAT, UTC+3, no
 * daylight saving). Pure functions only, so they can be unit-tested.
 */
export type Slot = "morning" | "evening" | "night";

export const SLOTS: { key: Slot; label: string; from: number; to: number; emoji: string }[] = [
  { key: "morning", label: "Morning 10", from: 6, to: 12, emoji: "🌅" },
  { key: "evening", label: "Evening 10", from: 12, to: 19, emoji: "🌇" },
  { key: "night", label: "Night 10", from: 19, to: 24, emoji: "🌙" },
];

const EAT_OFFSET_H = 3;
/** A round is only made if its first match is at least this far away, so players have time. */
export const MIN_LEAD_MINUTES = 60;

export const slotInfo = (s: string | null | undefined) => SLOTS.find((x) => x.key === s) ?? null;

/** "06:00–12:00 EAT" */
export const slotHours = (s: Slot) => {
  const x = slotInfo(s)!;
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  return `${hh(x.from)}–${hh(x.to)} EAT`;
};

/** Ethiopian calendar day (Gregorian date in EAT) as YYYY-MM-DD, plus `addDays`. */
export function eatDate(now = new Date(), addDays = 0): string {
  return new Date(now.getTime() + EAT_OFFSET_H * 3_600_000 + addDays * 86_400_000).toISOString().slice(0, 10);
}

/** UTC start/end of a slot on an EAT date. */
export function slotWindow(date: string, slot: Slot): { start: Date; end: Date } {
  const [y, m, d] = date.split("-").map(Number);
  const x = slotInfo(slot)!;
  return {
    start: new Date(Date.UTC(y, m - 1, d, x.from - EAT_OFFSET_H)),
    end: new Date(Date.UTC(y, m - 1, d, x.to - EAT_OFFSET_H)),
  };
}

/** Which slot an instant falls in (null for 00:00–05:59 EAT). */
export function slotOf(iso: string): Slot | null {
  const h = (new Date(iso).getUTCHours() + EAT_OFFSET_H) % 24;
  return SLOTS.find((s) => h >= s.from && h < s.to)?.key ?? null;
}

/** "Evening 10 · Thu 12 Nov" */
export function autoRoundName(date: string, slot: Slot): string {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));
  return `${slotInfo(slot)!.label} · ${day}`;
}

/** Pick the 10 earliest eligible matches in a slot, or null when there are fewer than 10. */
export function pickSlotMatches<T extends { kickoff_at: string }>(list: T[], date: string, slot: Slot, now = new Date()): T[] | null {
  const { start, end } = slotWindow(date, slot);
  const earliest = Math.max(start.getTime(), now.getTime() + MIN_LEAD_MINUTES * 60_000);
  const inSlot = list
    .filter((m) => {
      const t = new Date(m.kickoff_at).getTime();
      return t >= earliest && t < end.getTime();
    })
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  return inSlot.length >= 10 ? inSlot.slice(0, 10) : null;
}

