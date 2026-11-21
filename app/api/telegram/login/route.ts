/**
 * GET /api/telegram/login — where Telegram's "Log in with Telegram" button
 * sends the player back (data-auth-url). Telegram adds id, first_name, ...,
 * auth_date and hash to the URL; we check the signature with our bot token.
 *
 *  - Telegram already linked to a confirmed player → log them in.
 *  - Logged in on the website already → link this Telegram (or, if the phone
 *    isn't confirmed yet, the bot sends the one-tap "share my number" button).
 *  - Telegram not linked yet → remember the Telegram account for 30 minutes (signed cookie)
 *    and the bot writes first with the one-tap "Share my phone number" button. Telegram vouches
 *    that the number is theirs, so the account is confirmed (or created) with no password and the
 *    login page signs them in by itself (see /api/telegram/login-status). The sign-up form stays
 *    available for people who prefer a password.
 * The button asks for "write" access, so the bot may message the player first:
 * no need to find the bot and press START.
 */
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkLoginLock, clientIp, recordLoginAttempt } from "@/lib/login-lock";
import { PENDING_COOKIE, PENDING_TTL_SECONDS, safeNextPath, signPending, verifyLoginWidget } from "@/lib/telegram-login";
import { startSessionFor } from "@/lib/telegram-session";
import { startTelegramVerificationDm } from "@/lib/verification";
import { sendMessage } from "@/lib/telegram";
import { startOnboarding } from "@/lib/telegram-onboarding";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, normalizeReferralCode } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const next = safeNextPath(q.get("next"));
  const go = (path: string, params: Record<string, string> = {}) => {
    const url = new URL(path, req.url);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    return NextResponse.redirect(url, { status: 303 });
  };
  const fail = (message: string) => go("/login", { error: message, ...(next !== "/dashboard" ? { next } : {}) });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return fail("Telegram login isn't set up yet.");

  const v = verifyLoginWidget(q, token);
  if (!v.ok) return fail(v.reason === "expired" ? "That Telegram login is too old. Please tap the Telegram button again." : "Could not verify your Telegram login. Please try again.");

  const key = `tg:${v.user.id}`;
  const ip = await clientIp();
  const locked = await checkLoginLock(key, ip);
  if (locked) return fail(locked);

  const admin = createAdminClient();
  const { data: linked } = await admin
    .from("profiles")
    .select("id, phone_verified_at")
    .eq("telegram_user_id", v.user.id)
    .maybeSingle();

  // 1. Known player: log in.
  if (linked?.phone_verified_at) {
    const session = await startSessionFor(linked.id);
    await recordLoginAttempt(key, ip, session.ok);
    if (!session.ok) return fail(session.message);
    (await cookies()).delete(PENDING_COOKIE);
    return go(next);
  }

  // 2. Already logged in on the website: connect this Telegram account.
  const {
    data: { user: current },
  } = await (await createClient()).auth.getUser();
  if (current) {
    const { data: me } = await admin.from("profiles").select("telegram_user_id, phone_verified_at").eq("id", current.id).single();
    if (me?.telegram_user_id && Number(me.telegram_user_id) !== v.user.id) {
      return go(next); // keep the Telegram account it already has
    }
    if (!me?.phone_verified_at) {
      const sent = await startTelegramVerificationDm(current.id, v.user.id);
      if (sent === "taken") return go("/verify", { err: "This Telegram account is already linked to another player." });
      return go("/verify", sent === "sent" ? { tg: "sent", next } : { next });
    }
    if (linked && linked.id !== current.id) return go(next);
    await admin.from("profiles").update({ telegram_user_id: v.user.id }).eq("id", current.id).is("telegram_user_id", null);
    await sendMessage(v.user.id, "✅ Telegram connected to your GebetaSoccer account. Results, wins and wallet updates will arrive here.").catch(() => null);
    return go(next);
  }

  // 3. New player: remember Telegram for the sign-up form, and say hello right away.
  (await cookies()).set(PENDING_COOKIE, signPending(v.user, token), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PENDING_TTL_SECONDS,
  });
  // The bot writes first (the button asked for permission): age, then phone, then this page signs them in by itself.
  await startOnboarding(v.user.id, next !== "/dashboard" ? next : null).catch(() => null);
  // Invite link code: keep it for the sign-up form (also saved by the proxy cookie).
  const ref = normalizeReferralCode(q.get("ref"));
  if (ref) {
    (await cookies()).set(REF_COOKIE, ref, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: REF_COOKIE_MAX_AGE });
  }
  return go("/login", { tgwait: "1", ...(next !== "/dashboard" ? { next } : {}), ...(ref ? { ref } : {}) });
}
