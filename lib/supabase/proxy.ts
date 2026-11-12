// Refreshes the Supabase session cookie on every request and guards
// private pages. Called from /proxy.ts (Next.js 16's name for middleware).
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env";
import { LANG_COOKIE, LANG_HEADER, isTranslatable, localPath, stripLang } from "@/lib/i18n";

const PRIVATE_PREFIXES = ["/dashboard", "/admin", "/leaderboard", "/results", "/wallet", "/profile", "/notifications", "/todo", "/fixtures", "/match", "/career", "/certificates", "/leagues", "/join", "/challenges", "/premium", "/slip"];
const AUTH_PAGES = ["/login", "/register"];

export async function updateSession(request: NextRequest) {
  // Amharic pages: /am/how-to-play is served by /how-to-play with x-gs-lang: am.
  const rawPath = request.nextUrl.pathname;
  const amPath = rawPath === "/am" || rawPath.startsWith("/am/");
  if (amPath && !isTranslatable(stripLang(rawPath))) {
    // No Amharic version of this page yet: show the English one.
    const url = request.nextUrl.clone();
    url.pathname = stripLang(rawPath);
    return NextResponse.redirect(url);
  }
  // Remember Amharic: a visitor who chose አማ gets the Amharic version of every
  // translated public page (search engines have no cookie, so they still see both).
  if (!amPath && request.method === "GET" && request.cookies.get(LANG_COOKIE)?.value === "am" && isTranslatable(rawPath)) {
    const url = request.nextUrl.clone();
    url.pathname = localPath(rawPath, "am");
    return NextResponse.redirect(url);
  }
  const makeResponse = () => {
    if (!amPath) return NextResponse.next({ request });
    const headers = new Headers(request.headers);
    headers.set(LANG_HEADER, "am");
    const url = request.nextUrl.clone();
    url.pathname = stripLang(rawPath);
    const res = NextResponse.rewrite(url, { request: { headers } });
    if (request.cookies.get(LANG_COOKIE)?.value !== "am") res.cookies.set(LANG_COOKIE, "am", { path: "/", maxAge: 31536000, sameSite: "lax" });
    return res;
  };
  // A visitor can't pretend to be on an Amharic page by sending the header themselves.
  if (!amPath && request.headers.has(LANG_HEADER)) {
    try {
      request.headers.delete(LANG_HEADER);
    } catch {
      /* read-only headers: nothing to remove */
    }
  }
  let response = makeResponse();

  // Public pages (home, news, predictions, how to play...) don't need the login
  // check here: skipping it saves a round trip to the auth server on every view.
  // Private pages, sign-in pages and the Mini App still check the session.
  const pagePath = stripLang(rawPath);
  const needsSession =
    PRIVATE_PREFIXES.some((p) => pagePath.startsWith(p)) ||
    AUTH_PAGES.includes(pagePath) ||
    pagePath === "/verify" ||
    pagePath.startsWith("/tma") ||
    pagePath.startsWith("/auth") ||
    pagePath.startsWith("/api");
  // A logged-in visitor on a public page: refresh the login if it has expired,
  // so the new tokens are saved in the browser. (Pages can't save cookies; if
  // they refreshed instead, the one-time refresh token would be used up without
  // being stored and the player would be logged out.) No network call unless
  // the token has actually expired.
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!needsSession && !hasAuthCookie) return response;
  if (!needsSession) {
    const publicClient = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = makeResponse();
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    });
    try {
      await publicClient.auth.getSession();
    } catch {
      /* the page still works logged out */
    }
    return response;
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = makeResponse();
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

  const path = stripLang(request.nextUrl.pathname);

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
