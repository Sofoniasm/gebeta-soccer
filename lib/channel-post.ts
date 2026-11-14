/**
 * Posts for the public Telegram channel (@GebetaSoccerOfficial).
 * Pure functions only (no network, no database), so they can be unit-tested.
 */
import { formatKickoff } from "./format";
import { slotInfo } from "./round-slots";

export const DEFAULT_TELEGRAM_CHANNEL = "@GebetaSoccerOfficial";

/**
 * Turn "GebetaSoccerOfficial", "@GebetaSoccerOfficial" or "https://t.me/GebetaSoccerOfficial"
 * into "@GebetaSoccerOfficial". A numeric chat id (e.g. "-1001234567890") stays as it is.
 * Empty or invalid input gives the default channel.
 */
export function channelChatId(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (/^-?\d+$/.test(v)) return v;
  const name = v.replace(/^https?:\/\/(www\.)?(t|telegram)\.me\//i, "").replace(/^@/, "").replace(/\/+$/, "");
  return /^[A-Za-z][A-Za-z0-9_]{3,}$/.test(name) ? `@${name}` : DEFAULT_TELEGRAM_CHANNEL;
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export interface RoundAnnouncementInput {
  roundId: number;
  name: string;
  slot: string | null;
  matchCount: number;
  /** First kickoff (the round locks then), ISO string. */
  lockAt: string;
  /** Entry fee per slip in Units (1 Unit = 200 ETB). */
  feeUnits?: number | null;
  siteUrl: string;
  /** Bot username without "@", for an "Open in Telegram" button. Empty = no such button. */
  botUsername?: string;
}

/** The text (HTML) and inline buttons for "a new automatic round is open". */
export function buildRoundAnnouncement(r: RoundAnnouncementInput): {
  text: string;
  reply_markup: { inline_keyboard: { text: string; url: string }[][] };
} {
  const emoji = slotInfo(r.slot)?.emoji ?? "⚽";
  const lines = [
    `${emoji} <b>New round is open!</b>`,
    "",
    `<b>${esc(r.name)}</b>`,
    `⚽ ${r.matchCount} matches`,
    `🔒 Closes ${formatKickoff(r.lockAt)} (EAT)`,
  ];
  if (r.feeUnits != null && r.feeUnits > 0) lines.push(`🎟 Entry: ${r.feeUnits} Units (${r.feeUnits * 200} ETB)`);
  lines.push("", "Predict the scores and win the pot. Good luck! 🍀");

  const site = r.siteUrl.replace(/\/+$/, "");
  const row: { text: string; url: string }[] = [{ text: "▶️ Play", url: `${site}/dashboard?round=${r.roundId}` }];
  // Mini App (web_app) buttons are not allowed in channels: use a normal link to the bot.
  if (r.botUsername) row.push({ text: "🤖 Play in Telegram", url: `https://t.me/${r.botUsername.replace(/^@/, "")}?start=play` });
  return { text: lines.join("\n"), reply_markup: { inline_keyboard: [row] } };
}
