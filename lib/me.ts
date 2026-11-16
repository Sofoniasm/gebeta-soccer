import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-user";

export interface Me {
  id: string;
  username: string;
  phone_number: string | null;
  email: string | null;
  balance_units: number;
  is_admin: boolean;
  created_at: string;
  phone_verified_at: string | null;
  date_of_birth: string | null;
  avatar_url: string | null;
  excluded_until: string | null;
  /** Salespeople only (set by the admin). */
  referral_code: string | null;
}

/** The signed-in player's profile (cached per request). Redirects to login if signed out. */
export const getMe = cache(async (next = "/dashboard"): Promise<Me> => {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const cols = "id, username, phone_number, email, balance_units, is_admin, created_at, phone_verified_at, date_of_birth, avatar_url, excluded_until";
  const first = await supabase.from("profiles").select(`${cols}, referral_code`).eq("id", user.id).single();
  // Before the 0044 SQL is run there is no referral_code column: keep the app working.
  const row = (first.data ?? (first.error ? (await supabase.from("profiles").select(cols).eq("id", user.id).single()).data : null)) as Record<string, unknown> | null;
  if (!row) redirect("/login");

  return { ...row, referral_code: (row.referral_code as string | null | undefined) ?? null, balance_units: Number(row.balance_units) } as Me;
});

/** How many unread notifications the signed-in player has (cached per request). */
export const getUnreadCount = cache(async (): Promise<number> => {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  return count ?? 0;
});
