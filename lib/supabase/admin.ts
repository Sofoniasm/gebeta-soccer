// Supabase client with the SECRET (service role) key — bypasses Row Level Security.
//
// ⚠️  SERVER ONLY. Use from API routes / Server Actions after checking the
//     caller is an admin. Never import from a "use client" file.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, getSupabaseSecretKey } from "@/lib/env";

export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never run in the browser");
  }
  return createClient(SUPABASE_URL, getSupabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
