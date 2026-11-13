/**
 * POST /api/telegram/miniapp — sign in from the Telegram Mini App.
 *
 * Body: { initData } — the raw string from Telegram.WebApp.initData.
 *  1. Verify Telegram's HMAC signature with our bot token (server only).
 *  2. Find the GebetaSoccer player linked to that Telegram account
 *     (linked when they confirmed their phone with the bot).
 *  3. Start a normal Supabase session for them (same cookies as the website),
 *     so the Mini App shows exactly the same account, wallet and picks.
 * Unlinked Telegram accounts get { status: "unlinked" } and are asked to log in
 * or register once; after that it's automatic.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyInitData } from "@/lib/telegram-initdata";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkLoginLock, clientIp, recordLoginAttempt } from "@/lib/login-lock";
import { startSessionFor } from "@/lib/telegram-session";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ status: "error", message: "Telegram is not set up." }, { status: 500 });

  const body = (await req.json().catch(() => ({}))) as { initData?: string };
  const v = verifyInitData(String(body.initData ?? ""), token);
  if (!v.ok) {
    return NextResponse.json(
      { status: "invalid", message: v.reason === "expired" ? "This session is too old — close and reopen the app." : "Could not verify Telegram." },
      { status: 401 },
    );
  }

  const key = `tg:${v.user.id}`;
  const ip = await clientIp();
  const locked = await checkLoginLock(key, ip);
  if (locked) return NextResponse.json({ status: "locked", message: locked }, { status: 429 });

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, username, phone_verified_at")
    .eq("telegram_user_id", v.user.id)
    .maybeSingle();

  if (!profile || !profile.phone_verified_at) {
    // Already logged in here (e.g. just registered)? Then we can link straight away.
    const {
      data: { user: current },
    } = await (await createClient()).auth.getUser();
    return NextResponse.json({ status: "unlinked", loggedIn: !!current, firstName: v.user.first_name ?? "" });
  }

  // Start the normal website session for this player (same cookies as the website).
  const session = await startSessionFor(profile.id);
  if (!session.ok) {
    await recordLoginAttempt(key, ip, false);
    return NextResponse.json({ status: "error", message: session.message }, { status: 500 });
  }
  await recordLoginAttempt(key, ip, true);
  return NextResponse.json({ status: "ok", username: profile.username });
}
