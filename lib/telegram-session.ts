/**
 * Start a normal Supabase session for a player whose Telegram identity was
 * already verified (Mini App initData or the website login widget).
 * Server only: mints a one-time login and redeems it right here, which writes
 * the usual session cookies. Nothing is emailed.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function startSessionFor(userId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const admin = createAdminClient();
  const { data: authUser } = await admin.auth.admin.getUserById(userId);
  const email = authUser.user?.email;
  if (!email) return { ok: false, message: "Account has no login address." };

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  const tokenHash = link?.properties?.hashed_token;
  if (linkError || !tokenHash) return { ok: false, message: "Could not start your session." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (error) return { ok: false, message: "Could not start your session." };
  return { ok: true };
}
