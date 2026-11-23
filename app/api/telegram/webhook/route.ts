/**
 * Telegram bot webhook — phone verification.
 *  1. Player taps "Verify with Telegram" → opens t.me/<bot>?start=<token>
 *  2. Bot asks them to share their number (one-tap button)
 *  3. Telegram sends us the contact. We accept it only if it is the
 *     sender's OWN number (contact.user_id === from.id) and it matches
 *     the phone on their GebetaSoccer account.
 */
import { handleAppLoginCallback, handleAppLoginShort, handleAppLoginStart } from "@/lib/telegram-app-login-server";
import { parseAppLoginStart, parseLoginCommand } from "@/lib/telegram-app-login";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { markPhoneVerified } from "@/lib/verification";
import { confirmUnconfirmedAccount, createTelegramAccount } from "@/lib/telegram-account";
import { sendMessage, shareContactKeyboard } from "@/lib/telegram";
import { getBotLang, handleBotCommand } from "@/lib/bot-commands";
import { askAssistant } from "@/lib/assistant";
import { getSiteSettings } from "@/lib/site-settings";
import { finishOnboarding, handleOnboardingText, startOnboarding } from "@/lib/telegram-onboarding";

export const dynamic = "force-dynamic";

import { SITE_URL as SITE } from "@/lib/site";

interface TgUser { id: number; first_name?: string; last_name?: string; username?: string }
interface TgMessage {
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  contact?: { phone_number: string; user_id?: number };
}

const shareKeyboard = shareContactKeyboard;
const removeKeyboard = { reply_markup: { remove_keyboard: true } };
/** Inline button that opens the Mini App inside Telegram. */
const playButton = {
  reply_markup: { inline_keyboard: [[{ text: "⚽ Play GebetaSoccer", web_app: { url: `${SITE}/tma` } }]] },
};
/** "Play" button that opens the Mini App straight on a page (a round, a challenge). */
const playButtonTo = (path: string) => ({
  reply_markup: { inline_keyboard: [[{ text: "⚽ Play GebetaSoccer", web_app: { url: `${SITE}/tma?next=${encodeURIComponent(path)}` } }]] },
});
const mask = (p: string) => p.replace(/^(\+2519?\d{2})\d{4}(\d{2})$/, "$1••••$2");

export async function POST(req: NextRequest) {
  // Only Telegram (which knows the secret) may call this.
  // If the secret is missing on the server, refuse everything (never "undefined === undefined").
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => ({}))) as {
    message?: TgMessage;
    callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } };
  };
  // A tap on one of the three numbers of "Log in with the Telegram app".
  if (update.callback_query) {
    try {
      await handleAppLoginCallback(update.callback_query);
    } catch (e) {
      console.error("telegram app-login callback:", (e as Error).message);
    }
    return NextResponse.json({ ok: true });
  }
  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return NextResponse.json({ ok: true });

  const admin = createAdminClient();
  const chatId = msg.chat.id;

  try {
    // ---- "/login 123456": the fallback of "Open Telegram app to log in"
    const loginShort = parseLoginCommand(msg.text);
    if (loginShort && msg.from) {
      await handleAppLoginShort(chatId, msg.from.id, loginShort);
      return NextResponse.json({ ok: true });
    }

    // ---- /help, /balance, /rounds, /settings, /english, /amharic
    if (msg.text?.startsWith("/") && !msg.text.startsWith("/start")) {
      const handled = await handleBotCommand(chatId, msg.from?.id, msg.text);
      if (!handled) await sendMessage(chatId, "Send /help to see what I can do. · ምን ማድረግ እንደምችል ለማየት /help ይላኩ።");
      return NextResponse.json({ ok: true });
    }

    // ---- /start <token>
    if (msg.text?.startsWith("/start")) {
      const token = msg.text.split(" ")[1]?.trim();
      // "Open Telegram app to log in" on the website: ask for the number shown there.
      const appLoginToken = parseAppLoginStart(token);
      if (appLoginToken && msg.from) {
        await handleAppLoginStart(chatId, msg.from.id, appLoginToken);
        return NextResponse.json({ ok: true });
      }
      const ch = token?.match(/^c_(GC-[A-Z0-9]{6})$/);
      const roundLink = token?.match(/^r_(\d{1,9})$/);
      // Not a verification link: a new Telegram user is signed up right here in the chat (age, then phone).
      if (msg.from && (!token || token === "play" || ch || roundLink)) {
        const { data: known } = await admin.from("profiles").select("id, phone_verified_at").eq("telegram_user_id", msg.from.id).maybeSingle();
        if (!known?.phone_verified_at) {
          await startOnboarding(chatId, ch ? `/challenges/${ch[1]}` : roundLink ? `/dashboard?round=${roundLink[1]}&new=1#slip` : null);
          return NextResponse.json({ ok: true });
        }
      }
      if (ch) {
        await sendMessage(chatId, `🤝 You've been challenged on <b>GebetaSoccer</b>! Tap below to see the matches and the stake.`, {
          reply_markup: { inline_keyboard: [[{ text: `Open challenge ${ch[1]}`, web_app: { url: `${SITE}/tma?next=${encodeURIComponent(`/challenges/${ch[1]}`)}` } }]] },
        });
        return NextResponse.json({ ok: true });
      }
      const round = token?.match(/^r_(\d{1,9})$/);
      if (round) {
        await sendMessage(chatId, `🎯 Ready to predict? Tap below to open this round right here in Telegram. If you are new, we set you up in one tap.`, {
          reply_markup: { inline_keyboard: [[{ text: "⚽ Play this round", web_app: { url: `${SITE}/tma?next=${encodeURIComponent(`/dashboard?round=${round[1]}&new=1#slip`)}` } }]] },
        });
        return NextResponse.json({ ok: true });
      }
      if (!token || token === "play") {
        // "play" = the "Play in Telegram" button on channel posts
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

    // ---- text typed during the sign-up (date of birth)
    if (msg.text && !msg.text.startsWith("/") && !msg.contact && (await handleOnboardingText(chatId, msg.text))) {
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
        // Shared from the Mini App ("Continue with my Telegram number") or after "Log in with Telegram".
        // Telegram vouches that this is the sender's OWN number, so no password is needed:
        //  - a confirmed account with this number: link this Telegram to it;
        //  - an account never confirmed: its real owner takes it over (old password wiped);
        //  - no account: create one (confirmed phone, no password). Date of birth is asked in the app.
        const ob = await finishOnboarding(chatId); // age typed in the chat, and where to send them to play
        const shared = normalizeEthiopianPhone(msg.contact.phone_number);
        if (!shared) {
          await sendMessage(chatId, "GebetaSoccer is for Ethiopian mobile numbers (+251…). This Telegram number can't be used here. Message support if you think this is a mistake.", removeKeyboard);
          return NextResponse.json({ ok: true });
        }
        const { data: owner } = await admin.from("profiles").select("id, username, telegram_user_id, phone_verified_at").eq("phone_number", shared).maybeSingle();
        const { data: other } = await admin.from("profiles").select("id").eq("telegram_user_id", msg.from.id).maybeSingle();
        if (owner?.telegram_user_id && Number(owner.telegram_user_id) !== msg.from.id) {
          await sendMessage(chatId, "❌ This number's account is already linked to a different Telegram account. Contact support if that's wrong.", removeKeyboard);
        } else if (other && other.id !== owner?.id) {
          await sendMessage(chatId, "❌ This Telegram account is already linked to another GebetaSoccer player.", removeKeyboard);
        } else if (!owner) {
          const created = await createTelegramAccount(msg.from, shared, ob?.dob ?? undefined);
          if (created.ok) {
            await sendMessage(chatId, `✅ Welcome to <b>GebetaSoccer</b>, ${created.username}! Your account is ready: no password needed.\n\n${ob?.dob ? "Your age is confirmed, so you can play right away." : "The app will ask for your date of birth once (18+ only), then you can play."}`, { ...removeKeyboard });
            await sendMessage(chatId, "Tap to play 👇", ob?.next_path ? playButtonTo(ob.next_path) : playButton);
            const { telegram_support } = await getSiteSettings();
            await sendMessage(
              chatId,
              `💰 <b>To play you need Units</b> (1 Unit = 200 ETB, minimum 5 Units = 1,000 ETB).\n\nMessage our admin here: ${telegram_support}\nSend your Telebirr or bank payment and share the receipt. The admin adds your Units after checking, and you get a message from me right away.`,
              { disable_web_page_preview: true },
            );
          } else {
            await sendMessage(chatId, "Sorry, I couldn't create your account just now. Please try again in a minute, or message support.", removeKeyboard);
          }
        } else if (!owner.phone_verified_at) {
          await confirmUnconfirmedAccount(owner.id, msg.from.id);
          await sendMessage(
            chatId,
            `✅ Your phone is confirmed and linked to <b>${owner.username}</b>. The app opens straight into your account from now on.\n\nFor safety the old password was removed. You can set a new one in Profile, or use “Forgot password” (a code comes here in Telegram).`,
            { ...removeKeyboard },
          );
          await sendMessage(chatId, "Tap to play 👇", playButton);
        } else {
          if (!owner.telegram_user_id) await admin.from("profiles").update({ telegram_user_id: msg.from.id }).eq("id", owner.id);
          await sendMessage(chatId, `✅ Linked to <b>${owner.username}</b>. The app opens straight into your account from now on.`, { ...removeKeyboard });
          await sendMessage(chatId, "Tap to play 👇", playButton);
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
