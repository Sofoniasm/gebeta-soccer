/**
 * GET /api/telegram/setup — admin only. Connects the bot to this site
 * (sets the webhook, bot commands, menu button and the logo as profile photo). Visit once after adding the env vars.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tg, telegramEnabled } from "@/lib/telegram";
import { BOT_COMMANDS } from "@/lib/bot-commands";

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
  await tg("setMyCommands", { commands: BOT_COMMANDS.en });
  await tg("setMyCommands", { commands: BOT_COMMANDS.am, language_code: "am" });
  // "Play" button next to the message box opens the Mini App
  const menu = await tg("setChatMenuButton", {
    menu_button: { type: "web_app", text: "Play", web_app: { url: `${req.nextUrl.origin}/tma` } },
  });
  // Shown in the empty chat BEFORE the player taps Start (Telegram doesn't let
  // a bot send messages until then), so tell them exactly what to do.
  // Shown in the empty chat BEFORE the player taps Start: what the bot is for.
  await tg("setMyDescription", {
    description:
      "⚽ GebetaSoccer: Ethiopia's daily football prediction game (18+).\n\n" +
      "• Predict the scores of 10 big matches in the Morning, Evening or Night round\n" +
      "• The best slip wins 70% of the pool, every round\n" +
      "• Challenge friends, check your wallet and get your results right here\n\n" +
      "Tap START, then Play. Signed up on the website? Tap \"Continue with my Telegram number\" once and you're in.",
  });
  await tg("setMyDescription", {
    language_code: "am",
    description:
      "⚽ ገበጣሶከር፦ የኢትዮጵያ የዕለት የእግር ኳስ ውጤት ግምት ጨዋታ (18+)።\n\n" +
      "• በጠዋት፣ ከሰዓት ወይም ማታ ዙር የ10 ታላላቅ ጨዋታዎችን ውጤት ይገምቱ\n" +
      "• ምርጡ ስሊፕ በእያንዳንዱ ዙር የገንዳውን 70% ያሸንፋል\n" +
      "• ጓደኞችዎን ይግጠሙ፣ ዋሌትዎንና ውጤቶችዎን እዚሁ ይመልከቱ\n\n" +
      "START ን ከዚያ ይጫወቱን ይንኩ። በድረ-ገጹ ተመዝግበዋል? አንድ ጊዜ «በቴሌግራም ቁጥሬ ቀጥል» ን ይንኩ።",
  });
  await tg("setMyShortDescription", {
    short_description: "Predict 10 matches a round, win the pot. Daily rounds, challenges and results. 18+",
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
