import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { REF_COOKIE, REF_COOKIE_MAX_AGE, normalizeReferralCode } from "@/lib/referrals";

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  // Invite link (?ref=LAKI10 on any page): remember the code for the sign-up,
  // so it survives "Sign up with Telegram" and moving between pages.
  const ref = normalizeReferralCode(request.nextUrl.searchParams.get("ref"));
  if (ref && request.method === "GET") {
    response.cookies.set(REF_COOKIE, ref, { path: "/", maxAge: REF_COOKIE_MAX_AGE, sameSite: "lax", httpOnly: true, secure: process.env.NODE_ENV === "production" });
  }
  return response;
}

export const config = {
  // Skip static files, the cron endpoint and the webhooks.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/sync-matches|api/telegram/webhook|api/aurapay/webhook|api/nowpayments/ipn|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
