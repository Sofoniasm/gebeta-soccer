/**
 * Sign-up inside the Telegram bot chat (server only).
 *  1. a new Telegram user (not linked to a player yet) opens the bot → we ask for their date of birth (18+ only);
 *  2. a valid adult date → we ask them to share their phone number (Telegram vouches it is theirs);
 *  3. the shared number creates the account (see the contact branch of the webhook) and the Mini App opens
 *     straight into it, with the age already saved.
 * Under 18 is declined, but the chat stays open so a mistyped date can be sent again.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, shareContactKeyboard } from "@/lib/telegram";
import { ONBOARDING_TEXT, parseDob, safeNextPath } from "@/lib/onboarding";

const MAX_AGE_MS = 6 * 3600_000; // a half-finished sign-up is forgotten after 6 hours

interface Row {
  chat_id: number;
  step: "dob" | "phone";
  dob: string | null;
  next_path: string | null;
  updated_at: string;
}

async function getRow(chatId: number): Promise<Row | null> {
  const admin = createAdminClient();
  const { data } = await admin.from("telegram_onboarding").select("chat_id, step, dob, next_path, updated_at").eq("chat_id", chatId).maybeSingle();
  const row = (data as Row | null) ?? null;
  if (row && Date.now() - new Date(row.updated_at).getTime() > MAX_AGE_MS) {
    await admin.from("telegram_onboarding").delete().eq("chat_id", chatId);
    return null;
  }
  return row;
}

/** A new Telegram user: ask the first question. `next` = where "Play" should lead them afterwards. */
export async function startOnboarding(chatId: number, next?: string | null): Promise<void> {
  await createAdminClient()
    .from("telegram_onboarding")
    .upsert({ chat_id: chatId, step: "dob", dob: null, next_path: safeNextPath(next), updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
  await sendMessage(chatId, ONBOARDING_TEXT.askDob);
}

/** Text typed while a sign-up is in progress. Returns true when it was part of the sign-up (so nothing else answers it). */
export async function handleOnboardingText(chatId: number, text: string): Promise<boolean> {
  const row = await getRow(chatId);
  if (!row) return false;
  if (row.step === "phone") {
    await sendMessage(chatId, ONBOARDING_TEXT.remindPhone, shareContactKeyboard);
    return true;
  }
  const r = parseDob(text);
  if (!r.ok) {
    await sendMessage(chatId, r.reason === "under18" ? ONBOARDING_TEXT.under18 : r.reason === "invalid" ? ONBOARDING_TEXT.invalid : ONBOARDING_TEXT.badFormat);
    return true;
  }
  await createAdminClient().from("telegram_onboarding").update({ step: "phone", dob: r.iso, updated_at: new Date().toISOString() }).eq("chat_id", chatId);
  await sendMessage(chatId, ONBOARDING_TEXT.askPhone, shareContactKeyboard);
  return true;
}

/** Read and forget the sign-up answers (called when the shared number arrives). */
export async function finishOnboarding(chatId: number): Promise<{ dob: string | null; next_path: string | null } | null> {
  const row = await getRow(chatId);
  if (!row) return null;
  await createAdminClient().from("telegram_onboarding").delete().eq("chat_id", chatId);
  return { dob: row.step === "phone" ? row.dob : null, next_path: row.next_path };
}
