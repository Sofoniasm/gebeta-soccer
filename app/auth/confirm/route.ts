/**
 * Email confirmation landing. Handles both link styles Supabase can send:
 *   ?token_hash=...&type=email   (recommended; works across browsers)
 *   ?code=...                    (PKCE; must open in the same browser)
 */
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/dashboard";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/dashboard";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    // Opened in a different browser than the one used to sign up:
    // the email IS confirmed, the user just needs to log in.
    return NextResponse.redirect(`${origin}/login?confirmed=1`);
  }

  const msg = encodeURIComponent("That confirmation link is invalid or expired. Try logging in or register again.");
  return NextResponse.redirect(`${origin}/login?error=${msg}`);
}
