"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createTelegramToken, createSmsCode, checkSmsCode } from "@/lib/verification";
import { TELEGRAM_BOT_USERNAME, telegramEnabled } from "@/lib/telegram";
import { sendSms, smsEnabled } from "@/lib/sms";

export type VerifyState = { ok?: boolean; message?: string } | undefined;

async function currentUserId(): Promise<string> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/verify");
  return user.id;
}

/** Create a one-time token and open our bot in Telegram. */
export async function startTelegram(): Promise<void> {
  const userId = await currentUserId();
  if (!telegramEnabled()) redirect("/verify?err=" + encodeURIComponent("Telegram verification isn't set up yet."));
  const token = await createTelegramToken(userId);
  redirect(`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${token}`);
}

export async function sendCode(_prev: VerifyState): Promise<VerifyState> {
  const userId = await currentUserId();
  if (!smsEnabled()) return { ok: false, message: "SMS codes aren't available yet — please use Telegram." };

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("phone_number").eq("id", userId).single();
  if (!profile?.phone_number) return { ok: false, message: "No phone number on your account." };

  const { code, error } = await createSmsCode(userId);
  if (!code) return { ok: false, message: error };
  const sent = await sendSms(profile.phone_number, `Your GebetaSoccer code is ${code}. It expires in 10 minutes. Never share it.`);
  if (!sent.ok) return { ok: false, message: "We couldn't send the SMS right now. Please use Telegram or try again later." };
  return { ok: true, message: `Code sent to ${profile.phone_number}.` };
}

export async function confirmCode(_prev: VerifyState, formData: FormData): Promise<VerifyState> {
  const userId = await currentUserId();
  const code = String(formData.get("code") ?? "").replace(/\D/g, "");
  if (code.length !== 6) return { ok: false, message: "Enter the 6-digit code." };
  const result = await checkSmsCode(userId, code);
  if (!result.ok) return { ok: false, message: result.error };
  redirect("/dashboard");
}
