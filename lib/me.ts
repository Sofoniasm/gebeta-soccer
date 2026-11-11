import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
}

/** The signed-in player's profile (cached per request). Redirects to login if signed out. */
export const getMe = cache(async (next = "/dashboard"): Promise<Me> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);

  const { data } = await supabase
    .from("profiles")
    .select("id, username, phone_number, email, balance_units, is_admin, created_at, phone_verified_at, date_of_birth, avatar_url")
    .eq("id", user.id)
    .single();
  if (!data) redirect("/login");

  return { ...data, balance_units: Number(data.balance_units) } as Me;
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
