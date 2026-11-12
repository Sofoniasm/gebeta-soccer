import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Logged in? For public pages we only need to know which header buttons to
 * show, so we look for the Supabase session cookie instead of asking the auth
 * server (saves a network round trip on every public page). Private pages
 * still verify the session properly.
 */
export async function hasSessionCookie(): Promise<boolean> {
  try {
    return (await cookies()).getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token") && c.value.length > 0);
  } catch {
    return false;
  }
}

/** Shared data for public pages: a database client + login state (no extra network call). */
export async function getPublicContext() {
  const [supabase, loggedIn] = await Promise.all([createClient(), hasSessionCookie()]);
  return { supabase, loggedIn };
}

/** Public totals (players / predictions / rounds). Only call this when the numbers are shown. */
export async function getPublicStats(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data } = await supabase.rpc("get_public_stats").maybeSingle();
  return (data ?? { players: 0, predictions: 0, rounds: 0 }) as { players: number; predictions: number; rounds: number };
}
