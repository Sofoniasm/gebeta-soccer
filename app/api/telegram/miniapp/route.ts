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

  // Mint a one-time login for this player and redeem it right here, on the
  // server, which writes the normal session cookies. Nothing is emailed.
  const { data: authUser } = await admin.auth.admin.getUserById(profile.id);
  const email = authUser.user?.email;
  if (!email) return NextResponse.json({ status: "error", message: "Account has no login address." }, { status: 500 });

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) {
    return NextResponse.json({ status: "error", message: "Could not start your session." }, { status: 500 });
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) {
    await recordLoginAttempt(key, ip, false);
    return NextResponse.json({ status: "error", message: "Could not start your session." }, { status: 500 });
  }
  await recordLoginAttempt(key, ip, true);
  return NextResponse.json({ status: "ok", username: profile.username });
}
