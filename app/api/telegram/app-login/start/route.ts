/**
 * POST /api/telegram/app-login/start — the login page asks for a one-time "log in through the Telegram app".
 * Returns the t.me link to open and the 2-digit code to match in Telegram; the token itself stays in an httpOnly
 * cookie, so only this browser can finish the login.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { checkLoginLock, clientIp } from "@/lib/login-lock";
import { TELEGRAM_BOT_USERNAME, telegramEnabled } from "@/lib/telegram";
import { APP_LOGIN_COOKIE, APP_LOGIN_TTL_SECONDS, appLoginStartParam } from "@/lib/telegram-app-login";
import { createAppLogin } from "@/lib/telegram-app-login-server";

export const dynamic = "force-dynamic";

export async function POST() {
  if (!telegramEnabled()) return NextResponse.json({ ok: false, error: "Telegram login isn't set up yet." }, { status: 503 });
  const locked = await checkLoginLock("tg-app", await clientIp());
  if (locked) return NextResponse.json({ ok: false, error: locked }, { status: 429 });
  const made = await createAppLogin();
  if (!made) return NextResponse.json({ ok: false, error: "Please try again." }, { status: 500 });
  (await cookies()).set(APP_LOGIN_COOKIE, made.raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: APP_LOGIN_TTL_SECONDS,
  });
  return NextResponse.json({ ok: true, code: made.code, short: made.short, link: `https://t.me/${TELEGRAM_BOT_USERNAME}?start=${appLoginStartParam(made.raw)}`, seconds: APP_LOGIN_TTL_SECONDS });
}
