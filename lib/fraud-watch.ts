/** Loads the data for Fraud Watch (server only, admin pages). */
import { createAdminClient } from "@/lib/supabase/admin";
import { detectFraud, type FLedger, type FLogin, type FProfile, type FWithdrawal, type Flagged } from "@/lib/fraud-rules";

const DAY = 86_400_000;

// Supabase returns at most 1000 rows per request, so read in pages.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function all<T>(make: () => any, cap = 20_000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < cap; from += 1000) {
    const { data, error } = await make().range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function runFraudWatch(): Promise<{ flagged: Flagged[]; checked: number }> {
  const admin = createAdminClient();
  const since = new Date(Date.now() - 180 * DAY).toISOString();
  const loginSince = new Date(Date.now() - 30 * DAY).toISOString();
  const [profiles, ledger, withdrawals, logins] = await Promise.all([
    all<FProfile>(() => admin.from("profiles").select("id, username, phone_number, created_at, is_admin").order("created_at")),
    all<FLedger>(() => admin.from("wallet_ledger").select("user_id, kind, amount_units, created_at").gte("created_at", since).order("id")),
    all<FWithdrawal>(() => admin.from("withdrawal_requests").select("user_id, units, payout_phone, status, created_at").gte("created_at", since).order("id")),
    all<FLogin>(() => admin.from("login_attempts").select("login_key, ip, created_at").eq("success", true).gte("created_at", loginSince).order("id")),
  ]);
  return { flagged: detectFraud({ profiles, ledger, withdrawals, logins }), checked: profiles.length };
}
