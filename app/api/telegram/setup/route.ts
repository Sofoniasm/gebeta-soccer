/**
 * GET /api/telegram/setup — admin only. Connects the bot to this site
 * (sets the webhook, bot commands, menu button and the logo as profile photo). Visit once after adding the env vars.
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
  // "Play" button next to the message box opens the Mini App
  const menu = await tg("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Play", web_app: { url: `${req.nextUrl.origin}/tma` } },
  });
  // Shown in the empty chat BEFORE the player taps Start (Telegram doesn't let
  // a bot send messages until then), so tell them exactly what to do.
  await tg("setMyDescription", {
    description:
      "👋 Welcome to GebetaSoccer, Ethiopia's daily football prediction game.\n\n" +
      "To confirm your phone number:\n1️⃣ Tap START below\n2️⃣ Tap “Share my phone number”\n3️⃣ Go back to the website. You're in!\n\nIt's free and takes 5 seconds.",
  });
  await tg("setMyShortDescription", {
    short_description: "Confirm your GebetaSoccer phone number — tap START, then Share my phone number.",
  });
  // Profile picture = the GebetaSoccer logo (public/bot-avatar.jpg). Skip with ?photo=0.
  let photo: { ok: boolean; description?: string } = { ok: false, description: "skipped" };
  if (req.nextUrl.searchParams.get("photo") !== "0") photo = await setBotPhoto(`${req.nextUrl.origin}/bot-avatar.jpg`);
  const info = await tg("getWebhookInfo", {});
  return NextResponse.json({
    ok: hook.ok,
    webhook: url,
    telegram: hook.description,
    miniAppMenuButton: menu.ok,
    profilePhoto: photo.ok ? "set to the GebetaSoccer logo" : photo.description,
    info: info.result,
  });
}

/** Upload the logo as the bot's profile photo (Bot API setMyProfilePhoto, multipart). */
async function setBotPhoto(imageUrl: string): Promise<{ ok: boolean; description?: string }> {
  try {
    const img = await fetch(imageUrl, { cache: "no-store" });
    if (!img.ok) return { ok: false, description: `could not load ${imageUrl}` };
    const form = new FormData();
    form.append("photo", JSON.stringify({ type: "static", photo: "attach://logo" }));
    form.append("logo", new Blob([await img.arrayBuffer()], { type: "image/jpeg" }), "gebetasoccer.jpg");
    const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/setMyProfilePhoto`, { method: "POST", body: form, cache: "no-store" });
    return (await res.json()) as { ok: boolean; description?: string };
  } catch (e) {
    return { ok: false, description: (e as Error).message };
  }
}
