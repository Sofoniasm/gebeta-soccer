// Supabase client with the SERVICE ROLE key — bypasses Row Level Security.
//
// ⚠️  SERVER ONLY. Import this from API routes / Server Actions only,
//     never from a file marked "use client". The key has full database
//     access and must never reach the browser (note: no NEXT_PUBLIC_ prefix).
import { createClient } from "@supabase/supabase-js";

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable"
    );
  }
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never run in the browser");
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
