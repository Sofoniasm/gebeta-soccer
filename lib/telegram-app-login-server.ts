/**
 * Server side of "Log in with the Telegram app": starting a login, the bot's two steps, and the page's polling.
 * (Kept apart from lib/telegram-app-login.ts so that file stays pure and testable.)
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, tg } from "@/lib/telegram";
import {
  APP_LOGIN_TTL_SECONDS,
  appLoginCallback,
  codeChoices,
  hashAppLoginToken,
  newAppLoginCode,
  newAppLoginToken,
  parseAppLoginCallback,
} from "@/lib/telegram-app-login";

/** A new pending login: returns the raw token (for the cookie and the Telegram link) and the code to show. */
export async function createAppLogin(): Promise<{ raw: string; code: string } | null> {
  const admin = createAdminClient();
  await admin.from("telegram_app_logins").delete().lt("created_at", new Date(Date.now() - 3600_000).toISOString());
  const raw = newAppLoginToken();
  const code = newAppLoginCode();
  const { error } = await admin.from("telegram_app_logins").insert({
    token_hash: hashAppLoginToken(raw),
    code,
    expires_at: new Date(Date.now() + APP_LOGIN_TTL_SECONDS * 1000).toISOString(),
  });
  return error ? null : { raw, code };
}

/** The bot was opened with /start lg_<token>: ask the player to tap the number shown on the website. */
export async function handleAppLoginStart(chatId: number, telegramUserId: number, raw: string): Promise<void> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("telegram_app_logins")
    .select("id, code, status, expires_at")
    .eq("token_hash", hashAppLoginToken(raw))
    .maybeSingle();
  if (!row || row.status !== "pending" || new Date(row.expires_at as string).getTime() < Date.now()) {
    await sendMessage(chatId, "⌛ This login link has expired. Go back to GebetaSoccer and tap <b>Open Telegram app to log in</b> again.");
    return;
  }
  const { data: profile } = await admin.from("profiles").select("id, username, phone_verified_at").eq("telegram_user_id", telegramUserId).maybeSingle();
  if (!profile?.phone_verified_at) {
    await sendMessage(
      chatId,
      "I don't know this Telegram account yet. Send /start here to create your GebetaSoccer account in the chat (no password needed), then tap <b>Open Telegram app to log in</b> again.",
    );
    return;
  }
  await admin.from("telegram_app_logins").update({ telegram_user_id: telegramUserId, user_id: profile.id }).eq("id", row.id);
  const buttons = codeChoices(row.code as string).map((c) => ({ text: c, callback_data: appLoginCallback(row.id as number, c) }));
  const name = String(profile.username).replace(/[<>&]/g, "");
  await sendMessage(
    chatId,
    `🔐 <b>Log in to GebetaSoccer as ${name}?</b>\n\nTap the number that is shown on the website screen. If you did NOT just ask to log in, ignore this message.`,
    { reply_markup: { inline_keyboard: [buttons] } },
  );
}

/** The player tapped one of the three numbers. */
export async function handleAppLoginCallback(cb: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } }): Promise<void> {
  const parsed = parseAppLoginCallback(cb.data);
  if (!parsed) return;
  const admin = createAdminClient();
  const { data: row } = await admin.from("telegram_app_logins").select("id, code, status, telegram_user_id, expires_at").eq("id", parsed.id).maybeSingle();
  const edit = (text: string) =>
    cb.message ? tg("editMessageText", { chat_id: cb.message.chat.id, message_id: cb.message.message_id, text, parse_mode: "HTML" }) : Promise.resolve(null);
  if (!row || row.status !== "pending" || Number(row.telegram_user_id) !== cb.from.id || new Date(row.expires_at as string).getTime() < Date.now()) {
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "This login is no longer valid." });
    await edit("⌛ This login is no longer valid.");
    return;
  }
  if (parsed.code === row.code) {
    await admin.from("telegram_app_logins").update({ status: "approved" }).eq("id", row.id).eq("status", "pending");
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Approved" });
    await edit("✅ Approved. Go back to the website: you are being logged in.");
  } else {
    await admin.from("telegram_app_logins").update({ status: "denied" }).eq("id", row.id).eq("status", "pending");
    await tg("answerCallbackQuery", { callback_query_id: cb.id, text: "Wrong number" });
    await edit("❌ That is not the number on the website. The login was cancelled for your safety.");
  }
}

/** The page asks "is my login approved?". Returns the player's id exactly once, after approval. */
export async function pollAppLogin(raw: string): Promise<{ status: "waiting" | "denied" | "expired" } | { status: "ok"; userId: string }> {
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("telegram_app_logins")
    .select("id, status, user_id, expires_at")
    .eq("token_hash", hashAppLoginToken(raw))
    .maybeSingle();
  if (!row) return { status: "expired" };
  if (row.status === "denied") return { status: "denied" };
  if (row.status === "used") return { status: "expired" };
  if (new Date(row.expires_at as string).getTime() < Date.now()) return { status: "expired" };
  if (row.status !== "approved" || !row.user_id) return { status: "waiting" };
  // one use only: whoever flips approved -> used first gets the session
  const { data: used } = await admin.from("telegram_app_logins").update({ status: "used" }).eq("id", row.id).eq("status", "approved").select("id");
  if (!used || used.length === 0) return { status: "expired" };
  return { status: "ok", userId: row.user_id as string };
}
