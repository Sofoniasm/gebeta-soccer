/**
 * GET /api/telegram/login-status — polled by the login page after "Log in with Telegram" for a Telegram
 * that wasn't linked yet. The signed cookie (set by /api/telegram/login) says which Telegram account
 * just proved itself; once the bot has confirmed / created the account for it (the player tapped
 * "Share my phone number"), start the normal session. Nothing else can be read here.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkLoginLock, clientIp, recordLoginAttempt } from "@/lib/login-lock";
import { PENDING_COOKIE, readPending } from "@/lib/telegram-login";
import { startSessionFor } from "@/lib/telegram-session";

export const dynamic = "force-dynamic";

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ status: "expired" });
  const jar = await cookies();
  const pending = readPending(jar.get(PENDING_COOKIE)?.value, token);
  if (!pending) return NextResponse.json({ status: "expired" });

  const { data: profile } = await createAdminClient()
    .from("profiles")
    .select("id, phone_verified_at")
    .eq("telegram_user_id", pending.id)
    .maybeSingle();
  if (!profile?.phone_verified_at) return NextResponse.json({ status: "waiting" });

  const key = `tg:${pending.id}`;
  const ip = await clientIp();
  const locked = await checkLoginLock(key, ip);
  if (locked) return NextResponse.json({ status: "locked", message: locked }, { status: 429 });

  const session = await startSessionFor(profile.id);
  await recordLoginAttempt(key, ip, session.ok);
  if (!session.ok) return NextResponse.json({ status: "waiting" });
  jar.delete(PENDING_COOKIE);
  return NextResponse.json({ status: "ok" });
}
