import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-user";

/** Returns the signed-in admin's user id, or redirects non-admins away. */
export async function requireAdminId(next = "/admin"): Promise<string> {
  const [supabase, user] = await Promise.all([createClient(), getAuthUser()]);
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  const { data } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!data?.is_admin) redirect("/dashboard");
  return user.id;
}
