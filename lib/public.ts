import { createClient } from "@/lib/supabase/server";

/** Shared data for public pages: login state + live totals. */
export async function getPublicContext() {
  const supabase = await createClient();
  const [{ data: auth }, { data: statsRow }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("get_public_stats").maybeSingle(),
  ]);
  const stats = (statsRow ?? { players: 0, predictions: 0, rounds: 0 }) as { players: number; predictions: number; rounds: number };
  return { supabase, loggedIn: !!auth.user, stats };
}
