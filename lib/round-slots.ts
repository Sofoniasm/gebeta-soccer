/**
 * Time slots for automatic rounds, in Ethiopian time (EAT, UTC+3, no
 * daylight saving). Pure functions only, so they can be unit-tested.
 */
export type Slot = "late" | "morning" | "evening" | "night";

export const SLOTS: { key: Slot; label: string; am: string; from: number; to: number; emoji: string }[] = [
  // After midnight in Ethiopia: South American (Brazil) and late US games. Bet before you sleep.
  { key: "late", label: "Late night 10", am: "የሌሊት", from: 0, to: 6, emoji: "🌌" },
  { key: "morning", label: "Morning 10", am: "የጠዋት", from: 6, to: 12, emoji: "🌅" },
  { key: "evening", label: "Evening 10", am: "የከሰዓት", from: 12, to: 19, emoji: "🌇" },
  { key: "night", label: "Night 10", am: "የምሽት", from: 19, to: 24, emoji: "🌙" },
];

const EAT_OFFSET_H = 3;
/** A round is only made if its first match is at least this far away, so players have time. */
export const MIN_LEAD_MINUTES = 60;
/** A round has 5 to 10 matches (0048). */
export const MIN_ROUND_MATCHES = 5;
export const MAX_ROUND_MATCHES = 10;
/**
 * A slot with 5 to 9 matches gets a (smaller) round only when its first match is
 * this close, so the fixture list is complete. With 10 or more it opens right away.
 */
export const SMALL_ROUND_WAIT_HOURS = 24;

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

/** Which slot an instant falls in (every hour of the day belongs to one slot). */
export function slotOf(iso: string): Slot | null {
  const h = (new Date(iso).getUTCHours() + EAT_OFFSET_H) % 24;
  return SLOTS.find((s) => h >= s.from && h < s.to)?.key ?? null;
}

/**
 * "የከሰዓት 10 · Evening · Thu 12 Nov": Amharic slot name first, then English
 * (the number is how many matches the round has).
 */
export function autoRoundName(date: string, slot: Slot, matchCount = MAX_ROUND_MATCHES): string {
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" }).format(new Date(`${date}T00:00:00Z`));
  const x = slotInfo(slot)!;
  const en = x.label.replace(/\s*\d+$/, "");
  return `${x.am} ${matchCount} · ${en} · ${day}`;
}

/**
 * Split a round name for display: "የከሰዓት 10 · Evening · Sat 21 Nov" →
 * { main: "የከሰዓት 10", sub: "Evening · Sat 21 Nov" }. Other names stay whole.
 */
export function splitRoundName(name: string): { main: string; sub: string | null } {
  const i = name.indexOf(" · ");
  if (i > 0 && /[\u1200-\u137F]/.test(name.slice(0, i))) return { main: name.slice(0, i), sub: name.slice(i + 3) };
  return { main: name, sub: null };
}

/**
 * Pick the earliest eligible matches of a slot (up to 10).
 *  - 10 or more: the 10 earliest, right away.
 *  - 5 to 9: all of them, but only once the first one is within 24 hours.
 *  - fewer than 5: no round (null).
 */
export function pickSlotMatches<T extends { kickoff_at: string }>(list: T[], date: string, slot: Slot, now = new Date()): T[] | null {
  const { start, end } = slotWindow(date, slot);
  const earliest = Math.max(start.getTime(), now.getTime() + MIN_LEAD_MINUTES * 60_000);
  const inSlot = list
    .filter((m) => {
      const t = new Date(m.kickoff_at).getTime();
      return t >= earliest && t < end.getTime();
    })
    .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at));
  if (inSlot.length >= MAX_ROUND_MATCHES) return inSlot.slice(0, MAX_ROUND_MATCHES);
  if (inSlot.length < MIN_ROUND_MATCHES) return null;
  const firstIn = new Date(inSlot[0].kickoff_at).getTime() - now.getTime();
  return firstIn <= SMALL_ROUND_WAIT_HOURS * 3_600_000 ? inSlot : null;
}

