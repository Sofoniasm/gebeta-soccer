/**
 * Telegram bot webhook — phone verification.
 *  1. Player taps "Verify with Telegram" → opens t.me/<bot>?start=<token>
 *  2. Bot asks them to share their number (one-tap button)
 *  3. Telegram sends us the contact. We accept it only if it is the
 *     sender's OWN number (contact.user_id === from.id) and it matches
 *     the phone on their GebetaSoccer account.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { markPhoneVerified } from "@/lib/verification";
import { sendMessage } from "@/lib/telegram";
import { getBotLang, handleBotCommand } from "@/lib/bot-commands";
import { askAssistant } from "@/lib/assistant";

export const dynamic = "force-dynamic";

import { SITE_URL as SITE } from "@/lib/site";

interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }
interface TgMessage {
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}

const shareKeyboard = {
  reply_markup: {
    keyboard: [[{ text: "📱 Share my phone number", request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  },
};
const removeKeyboard = { reply_markup: { remove_keyboard: true } };
/** Inline button that opens the Mini App inside Telegram. */
const playButton = {
  reply_markup: { inline_keyboard: [[{ text: "⚽ Play GebetaSoccer", web_app: { url: `${SITE}/tma` } }]] },
};
const mask = (p: string) => p.replace(/^(\+2519?\d{2})\d{4}(\d{2})$/, "$1••••$2");

export async function POST(req: NextRequest) {
  // Only Telegram (which knows the secret) may call this.
  if (req.headers.get("x-telegram-bot-api-secret-token") !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => ({}))) as { message?: TgMessage };
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const chatId = msg.chat.id;

  try {
    // ---- /help, /balance, /rounds, /settings, /english, /amharic
    if (msg.text?.startsWith("/") && !msg.text.startsWith("/start")) {
      const handled = await handleBotCommand(chatId, msg.from?.id, msg.text);
      if (!handled) await sendMessage(chatId, "Send /help to see what I can do. · ምን ማድረግ እንደምችል ለማየት /help ይላኩ።");
      return NextResponse.json({ ok: true });
    }

    // ---- /start <token>
    if (msg.text?.startsWith("/start")) {
      const token = msg.text.split(" ")[1]?.trim();
      const ch = token?.match(/^c_(GC-[A-Z0-9]{6})$/);
      if (ch) {
        await sendMessage(chatId, `🤝 You've been challenged on <b>GebetaSoccer</b>! Tap below to see the matches and the stake.`, {
          reply_markup: { inline_keyboard: [[{ text: `Open challenge ${ch[1]}`, web_app: { url: `${SITE}/tma?next=${encodeURIComponent(`/challenges/${ch[1]}`)}` } }]] },
        });
        return NextResponse.json({ ok: true });
      }
      if (!token) {
        await sendMessage(
          chatId,
          `👋 Welcome to <b>GebetaSoccer</b>!\n\nPredict 10 big matches in today's round and win the pot. Tap the button to play right here in Telegram 👇`,
          playButton,
        );
        return NextResponse.json({ ok: true });
      }
      const { data: row } = await admin
        .from("phone_verifications")
        .select("id, expires_at, verified_at")
        .eq("token", token)
        .eq("method", "telegram")
        .maybeSingle();
      if (!row || row.verified_at || new Date(row.expires_at).getTime() < Date.now()) {
        await sendMessage(chatId, "⌛ This verification link has expired. Go back to GebetaSoccer and tap <b>Verify with Telegram</b> again.");
        return NextResponse.json({ ok: true });
      }
      await admin.from("phone_verifications").update({ telegram_chat_id: chatId }).eq("id", row.id);
      await sendMessage(chatId, "To confirm your GebetaSoccer account, tap the button below to share your phone number. 👇", shareKeyboard);
      return NextResponse.json({ ok: true });
    }

    // ---- any other text: the help assistant answers
    if (msg.text && !msg.text.startsWith("/") && !msg.contact) {
      const lang = await getBotLang(chatId);
      const { data: linked } = msg.from
        ? await admin.from("profiles").select("id").eq("telegram_user_id", msg.from.id).maybeSingle()
        : { data: null };
      const { reply, handedOff } = await askAssistant({
        question: msg.text,
        userId: linked?.id ?? null,
        chatId,
        channel: "telegram",
        lang,
        telegram: msg.from ?? null,
      });
      const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      await sendMessage(chatId, (handedOff ? "🆘 " : "") + esc(reply));
      return NextResponse.json({ ok: true });
    }

    // ---- shared contact
    if (msg.contact) {
      if (!msg.from || msg.contact.user_id !== msg.from.id) {
        await sendMessage(chatId, "Please share <b>your own</b> number using the button below.", shareKeyboard);
        return NextResponse.json({ ok: true });
      }
      const { data: pending } = await admin
        .from("phone_verifications")
        .select("id, user_id, expires_at")
        .eq("telegram_chat_id", chatId)
        .eq("method", "telegram")
        .is("verified_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!pending || new Date(pending.expires_at).getTime() < Date.now()) {
        // Shared from the Mini App ("Continue with my Telegram number"): link this
        // Telegram account to the website account with the same confirmed phone.
        const shared = normalizeEthiopianPhone(msg.contact.phone_number);
        const { data: owner } = shared
          ? await admin.from("profiles").select("id, username, telegram_user_id, phone_verified_at").eq("phone_number", shared).maybeSingle()
          : { data: null };
        if (!owner) {
          await sendMessage(chatId, "There's no GebetaSoccer account with this number yet. Tap below to create one; it takes a minute.", playButton);
        } else if (!owner.phone_verified_at) {
          await sendMessage(chatId, "This account hasn't confirmed its phone yet. Log in on the website once and confirm it with Telegram.", playButton);
        } else if (owner.telegram_user_id && Number(owner.telegram_user_id) !== msg.from.id) {
          await sendMessage(chatId, "❌ This number's account is already linked to a different Telegram account. Contact support if that's wrong.", removeKeyboard);
        } else {
          const { data: other } = await admin.from("profiles").select("id").eq("telegram_user_id", msg.from.id).neq("id", owner.id).maybeSingle();
          if (other) {
            await sendMessage(chatId, "❌ This Telegram account is already linked to another GebetaSoccer player.", removeKeyboard);
          } else {
            if (!owner.telegram_user_id) await admin.from("profiles").update({ telegram_user_id: msg.from.id }).eq("id", owner.id);
            await sendMessage(chatId, `✅ Linked to <b>${owner.username}</b>. The app opens straight into your account from now on.`, { ...removeKeyboard });
            await sendMessage(chatId, "Tap to play 👇", playButton);
          }
        }
        return NextResponse.json({ ok: true });
      }

      const shared = normalizeEthiopianPhone(msg.contact.phone_number);
      const { data: profile } = await admin.from("profiles").select("phone_number, username").eq("id", pending.user_id).single();
      if (!shared || !profile || shared !== profile.phone_number) {
        await sendMessage(
          chatId,
          `❌ This Telegram account's number${shared ? ` (${mask(shared)})` : ""} doesn't match the number on your GebetaSoccer account${profile?.phone_number ? ` (${mask(profile.phone_number)})` : ""}.\n\nUse the Telegram account registered with the same phone number, or contact support.`,
          removeKeyboard
        );
        return NextResponse.json({ ok: true });
      }

      // One Telegram account per player
      const { data: other } = await admin.from("profiles").select("id").eq("telegram_user_id", msg.from.id).neq("id", pending.user_id).maybeSingle();
      if (other) {
        await sendMessage(chatId, "❌ This Telegram account is already linked to another GebetaSoccer player.", removeKeyboard);
        return NextResponse.json({ ok: true });
      }

      await admin.from("phone_verifications").update({ verified_at: new Date().toISOString() }).eq("id", pending.id);
      await markPhoneVerified(pending.user_id, msg.from.id);
      await sendMessage(chatId, `✅ <b>Verified!</b> Welcome, ${profile.username}.`, removeKeyboard);
      await sendMessage(chatId, "You're ready to play — here in Telegram or on the website. 👇", playButton);
      return NextResponse.json({ ok: true });
    }
  } catch (e) {
    console.error("telegram webhook error", e);
  }
  return NextResponse.json({ ok: true });
}
