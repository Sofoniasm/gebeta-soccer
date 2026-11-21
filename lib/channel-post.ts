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
  /** Short name of the Mini App registered in @BotFather (/newapp). Set = the button opens the app straight on this round. */
  miniAppName?: string;
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
  if (r.feeUnits != null && r.feeUnits > 0) lines.push(`🎟 Entry: ${unitsText(r.feeUnits)} (${etbText(r.feeUnits)})`);
  lines.push("", "Predict the scores and win the pot. Good luck! 🍀");

  const site = r.siteUrl.replace(/\/+$/, "");
  const row: { text: string; url: string }[] = [{ text: "▶️ Play", url: `${site}/dashboard?round=${r.roundId}` }];
  // Mini App (web_app) buttons are not allowed in channels: use a normal link to the bot.
  if (r.botUsername) {
    const bot = r.botUsername.replace(/^@/, "");
    // With a Mini App registered in @BotFather (/newapp) the link opens the app straight on this round;
    // otherwise it opens the bot, which answers with a "Play this round" button.
    const url = r.miniAppName ? `https://t.me/${bot}/${r.miniAppName}?startapp=r_${r.roundId}` : `https://t.me/${bot}?start=r_${r.roundId}`;
    row.push({ text: "🤖 Play in Telegram", url });
  }
  return { text: lines.join("\n"), reply_markup: { inline_keyboard: [row] } };
}

// ---- winners ----------------------------------------------------------------

export interface WinnersPostInput {
  roundName: string;
  /** One row per winning slip. The same player with several winning slips is added up. */
  winners: { username: string; units: number; rank: number }[];
  poolUnits: number;
  players: number;
  siteUrl: string;
}

const MEDAL = ["🥇", "🥈", "🥉"];
const unitsText = (u: number) => `${Math.round(u * 100) / 100} Unit${Math.round(u * 100) / 100 === 1 ? "" : "s"}`;
const etbText = (u: number) => `${(Math.round(u * 200 * 100) / 100).toLocaleString("en-US")} ETB`;

/** The public "who won" post for one settled round: usernames and amounts only. null when nobody won. */
export function buildWinnersPost(r: WinnersPostInput): {
  text: string;
  reply_markup: { inline_keyboard: { text: string; url: string }[][] };
} | null {
  const byUser = new Map<string, { units: number; rank: number }>();
  for (const w of r.winners) {
    if (!(w.units > 0)) continue;
    const cur = byUser.get(w.username);
    byUser.set(w.username, { units: (cur?.units ?? 0) + w.units, rank: Math.min(cur?.rank ?? w.rank, w.rank) });
  }
  if (byUser.size === 0) return null;
  const list = [...byUser].map(([username, v]) => ({ username, ...v })).sort((a, b) => a.rank - b.rank || b.units - a.units);
  const top = list.slice(0, 3);
  const lines = [`🏆 <b>${esc(r.roundName)}: results</b>`, ""];
  for (const w of top) lines.push(`${MEDAL[Math.min(w.rank, 3) - 1] ?? "🏅"} <b>${esc(w.username)}</b> won ${unitsText(w.units)} (${etbText(w.units)})`);
  if (list.length > top.length) lines.push(`…and ${list.length - top.length} more winner${list.length - top.length === 1 ? "" : "s"}`);
  lines.push("", `💰 Pool: ${unitsText(r.poolUnits)} (${etbText(r.poolUnits)}) · ${r.players} player${r.players === 1 ? "" : "s"}`, "", "Congratulations! 🎉 Next round is waiting for you.");
  const site = r.siteUrl.replace(/\/+$/, "");
  return { text: lines.join("\n"), reply_markup: { inline_keyboard: [[{ text: "▶️ Play next round", url: `${site}/dashboard` }]] } };
}
