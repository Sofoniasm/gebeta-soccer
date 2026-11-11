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

export const dynamic = "force-dynamic";

import { SITE_URL as SITE } from "@/lib/site";

interface TgUser { id: number; first_name?: string }
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
    // ---- /start <token>
    if (msg.text?.startsWith("/start")) {
      const token = msg.text.split(" ")[1]?.trim();
      if (!token) {
        await sendMessage(
          chatId,
          `👋 Welcome to <b>GebetaSoccer</b>!\n\nPredict 10 big matches every week and win the pot. Tap the button to play right here in Telegram 👇`,
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
        await sendMessage(chatId, "⌛ No active verification. Go back to GebetaSoccer and tap <b>Verify with Telegram</b>.", removeKeyboard);
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
