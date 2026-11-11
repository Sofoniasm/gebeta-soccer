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
    .select("id, username, phone_number, email, balance_units, is_admin, created_at")
    .eq("id", user.id)
    .single();
  if (!data) redirect("/login");

  return { ...data, balance_units: Number(data.balance_units) } as Me;
});
