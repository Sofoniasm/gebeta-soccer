/**
 * GET /api/telegram/app-login/status — polled by the login page after "Open Telegram app to log in".
 * When the player has tapped the right number in Telegram, this starts the normal session (once).
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkLoginLock, clientIp, recordLoginAttempt } from "@/lib/login-lock";
import { startSessionFor } from "@/lib/telegram-session";
import { APP_LOGIN_COOKIE } from "@/lib/telegram-app-login";
import { pollAppLogin } from "@/lib/telegram-app-login-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const jar = await cookies();
  const raw = jar.get(APP_LOGIN_COOKIE)?.value;
  if (!raw) return NextResponse.json({ status: "expired" });
  const res = await pollAppLogin(raw);
  if (res.status !== "ok") {
    if (res.status !== "waiting") jar.delete(APP_LOGIN_COOKIE);
    return NextResponse.json({ status: res.status });
  }
  const key = `tgapp:${res.userId}`;
  const ip = await clientIp();
  const locked = await checkLoginLock(key, ip);
  if (locked) return NextResponse.json({ status: "locked", message: locked }, { status: 429 });
  const session = await startSessionFor(res.userId);
  await recordLoginAttempt(key, ip, session.ok);
  jar.delete(APP_LOGIN_COOKIE);
  return NextResponse.json({ status: session.ok ? "ok" : "expired" });
}
