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
  const info = await tg("getWebhookInfo", {});
  return NextResponse.json({ ok: hook.ok, webhook: url, telegram: hook.description, info: info.result });
}
