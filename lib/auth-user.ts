import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user, asked from Supabase once per page load (shared by the shell, to-do and page). */
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
