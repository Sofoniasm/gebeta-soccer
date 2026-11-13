/**
 * Telegram bot helpers (server only).
 * Env (Vercel → Settings → Environment Variables):
 *   TELEGRAM_BOT_TOKEN        from @BotFather
 *   TELEGRAM_BOT_USERNAME     e.g. GebetaSoccerBot (without @)
 *   TELEGRAM_WEBHOOK_SECRET   any long random string
 */
export const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "";
/** The bot's public numeric id (the part of the token before ":"), for Telegram's login popup. */
export const telegramBotId = () => /^(\d+):/.exec(process.env.TELEGRAM_BOT_TOKEN ?? "")?.[1] ?? "";
export const telegramEnabled = () => Boolean(process.env.TELEGRAM_BOT_TOKEN && TELEGRAM_BOT_USERNAME);

export async function tg(method: string, body: Record<string, unknown>) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return (await res.json()) as { ok: boolean; description?: string; result?: unknown };
}

export function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  return tg("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });
}

/** Reply keyboard with Telegram's one-tap "share my number" button. */
export const shareContactKeyboard = {
  reply_markup: {
    keyboard: [[{ text: "📱 Share my phone number", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};
