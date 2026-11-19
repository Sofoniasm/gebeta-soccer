/**
 * Challenge invites by phone number (pure helpers, shared by server and browser).
 * The database does the real work (supabase/migrations/0053_challenge_invites.sql).
 */
import { normalizeEthiopianPhone } from "@/lib/phone";

export const MAX_INVITES_AT_ONCE = 10;

export type InviteStatus =
  | "notified"
  | "waiting_verify"
  | "not_on_app"
  | "already_in"
  | "already_invited"
  | "self"
  | "invalid";
export type InviteRow = { phone: string; status: InviteStatus | string };

/** Phone numbers typed one per line or separated by commas / semicolons. Spaces inside a number are fine. */
export function parseInvitePhones(text: string): { phones: string[]; bad: string[] } {
  const phones: string[] = [];
  const bad: string[] = [];
  for (const part of text.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const n = normalizeEthiopianPhone(part);
    if (!n) bad.push(part);
    else if (!phones.includes(n)) phones.push(n);
  }
  return { phones, bad };
}

/** +251911223344 -> +251 91 122 3344 */
export function formatPhone(p: string): string {
  const m = /^\+251(\d{2})(\d{3})(\d{4})$/.exec(p);
  return m ? `+251 ${m[1]} ${m[2]} ${m[3]}` : p;
}

/** Plain words for one invite result (creator's view). */
export function inviteStatusText(status: string): string {
  switch (status) {
    case "notified": return "Notified in the app and Telegram";
    case "waiting_verify": return "Has an account; will be told as soon as they confirm their phone";
    case "not_on_app": return "Not on GebetaSoccer yet: send them the link. They are told when they sign up with this number";
    case "already_in": return "Already in this challenge";
    case "already_invited": return "Already invited";
    case "self": return "That is your own number";
    case "invalid": return "Not a valid Ethiopian mobile number";
    default: return status;
  }
}

/** One short line for the message after sending invites. */
export function inviteSummary(rows: InviteRow[]): string {
  const n = (s: string) => rows.filter((r) => r.status === s).length;
  const told = n("notified") + n("waiting_verify");
  const parts: string[] = [];
  if (told) parts.push(`${told} player${told === 1 ? "" : "s"} invited`);
  if (n("not_on_app")) parts.push(`${n("not_on_app")} not on GebetaSoccer yet (send them the link)`);
  const skipped = n("already_in") + n("already_invited") + n("self") + n("invalid");
  if (skipped) parts.push(`${skipped} skipped`);
  return parts.length ? parts.join(" · ") + "." : "Nothing to send.";
}

/** Friendly text for errors raised by invite_to_challenge. */
export function inviteError(m: string): string {
  if (m.includes("only the creator")) return "Only the person who made the challenge can invite players.";
  if (m.includes("closed")) return "This challenge is closed: its first match has kicked off.";
  if (m.includes("too many invites at once")) return `Invite up to ${MAX_INVITES_AT_ONCE} players at a time.`;
  if (m.includes("too many invites for this challenge")) return "This challenge already has the most invites it can have (30).";
  if (m.includes("limit reached")) return "You have sent a lot of invites today. Please try again tomorrow, or share the link.";
  if (m.includes("not found")) return "Challenge not found.";
  if (m.includes("not signed in")) return "Please log in again.";
  return "Could not send the invites. Please try again.";
}
