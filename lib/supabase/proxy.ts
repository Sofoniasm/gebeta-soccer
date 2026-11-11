// Refreshes the Supabase session cookie on every request and guards
// private pages. Called from /proxy.ts (Next.js 16's name for middleware).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";

const PRIVATE_PREFIXES = ["/dashboard", "/admin", "/leaderboard", "/results", "/wallet", "/profile", "/notifications", "/todo", "/fixtures", "/match", "/career", "/certificates", "/leagues", "/join"];
const AUTH_PAGES = ["/login", "/register"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not put code between createServerClient and getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  const verified = user?.app_metadata?.phone_verified === true;

  if (!user && (PRIVATE_PREFIXES.some((p) => path.startsWith(p)) || path === "/verify")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  // Logged in but phone not confirmed yet → verification page.
  if (user && !verified && PRIVATE_PREFIXES.some((p) => path.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/verify";
    url.search = path === "/dashboard" ? "" : `?next=${encodeURIComponent(path)}`;
    return NextResponse.redirect(url);
  }

  if (user && AUTH_PAGES.includes(path)) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get("next");
    const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : null;
    url.pathname = verified ? safe ?? "/dashboard" : "/verify";
    url.search = !verified && safe ? `?next=${encodeURIComponent(safe)}` : "";
    return NextResponse.redirect(url);
  }

  // Player, admin and sign-in pages must never show up in search results.
  if (PRIVATE_PREFIXES.some((p) => path.startsWith(p)) || path === "/login" || ["/verify", "/tma"].some((p) => path.startsWith(p))) {
    response.headers.set("X-Robots-Tag", "noindex, nofollow");
  }

  return response;
}
