/**
 * GET /api/telegram/setup — admin only. Connects the bot to this site
 * (sets the webhook + bot commands). Visit once after adding the env vars.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tg, telegramEnabled } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log in as admin first" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  if (!telegramEnabled() || !process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Set TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME and TELEGRAM_WEBHOOK_SECRET in Vercel, then redeploy." }, { status: 400 });
  }

  const url = `${req.nextUrl.origin}/api/telegram/webhook`;
  const hook = await tg("setWebhook", {
    url,
    secret_token: process.env.TELEGRAM_WEBHOOK_SECRET,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  await tg("setMyCommands", { commands: [{ command: "start", description: "Open GebetaSoccer" }] });
  // Shown in the empty chat BEFORE the player taps Start (Telegram doesn't let
  // a bot send messages until then), so tell them exactly what to do.
  await tg("setMyDescription", {
    description:
      "👋 Welcome to GebetaSoccer — Ethiopia's weekly football prediction game.\n\n" +
      "To confirm your phone number:\n1️⃣ Tap START below\n2️⃣ Tap “Share my phone number”\n3️⃣ Go back to the website — you're in!\n\nIt's free and takes 5 seconds.",
  });
  await tg("setMyShortDescription", {
    short_description: "Confirm your GebetaSoccer phone number — tap START, then Share my phone number.",
  });
  const info = await tg("getWebhookInfo", {});
  return NextResponse.json({ ok: hook.ok, webhook: url, telegram: hook.description, info: info.result });
}
