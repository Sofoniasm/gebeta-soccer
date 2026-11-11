/** Age check for sign-up: players must be 18 or older (Ethiopia time). */
export const MIN_AGE = 18;

/** Today's date in Addis Ababa as YYYY-MM-DD. */
export function todayInAddis(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Addis_Ababa", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Latest birth date that is still 18+ today, e.g. "2008-11-12" on 2026-11-12. */
export function latestAdultBirthDate(now = new Date()): string {
  const [y, m, d] = todayInAddis(now).split("-").map(Number);
  // Born on 29 Feb: Date handles the roll-over to 1 Mar in non-leap years.
  const dt = new Date(Date.UTC(y - MIN_AGE, m - 1, d));
  return dt.toISOString().slice(0, 10);
}

/** null when OK, otherwise a message for the player. */
export function dobError(value: string, now = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "Enter your date of birth.";
  const dt = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== value) return "That date of birth isn't valid.";
  if (value < "1900-01-01") return "That date of birth isn't valid.";
  if (value > latestAdultBirthDate(now)) return "You must be 18 or older to play GebetaSoccer.";
  return null;
}
