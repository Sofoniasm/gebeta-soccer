import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEthiopianPhone } from "@/lib/phone";

/** One key per login, however it was typed: "0911 22 33 44" and "+251911223344" are the same. */
export function loginKey(identifier: string): string {
  const id = identifier.trim();
  return normalizeEthiopianPhone(id) ?? id.toLowerCase();
}

/** The visitor's real IP. On Vercel, x-real-ip / x-forwarded-for are set by Vercel itself. */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Returns an error message if this login or network is locked, otherwise null. */
export async function checkLoginLock(key: string, ip: string): Promise<string | null> {
  const { data, error } = await createAdminClient()
    .rpc("login_lock_status", { p_key: key, p_ip: ip })
    .maybeSingle();
  if (error) {
    // If the lock table isn't set up, don't lock everyone out — just log it.
    console.error("login_lock_status failed:", error.message);
    return null;
  }
  const row = data as { scope: string; retry_minutes: number } | null;
  if (!row) return null;
  const mins = row.retry_minutes;
  return `Too many attempts. Please try again in ${mins} minute${mins === 1 ? "" : "s"}.`;
}

export async function recordLoginAttempt(key: string, ip: string, success: boolean): Promise<void> {
  const { error } = await createAdminClient().rpc("record_login_attempt", {
    p_key: key,
    p_ip: ip,
    p_success: success,
  });
  if (error) console.error("record_login_attempt failed:", error.message);
}
