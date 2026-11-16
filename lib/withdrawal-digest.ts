/**
 * Daily message to the admins: how many withdrawals are waiting to be paid.
 * Called by the daily cron (09:00 Ethiopian time). Sent only when something
 * is waiting, and at most once a day. It is a normal notification (shown in
 * the app and, when the admin linked Telegram, sent by the bot).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { ETB_PER_UNIT } from "@/lib/money";

const KIND = "admin_withdrawals";

/** Text of the message (pure, tested). Oldest first in `waitingSince`. */
export function withdrawalDigestText(rows: { units: number; created_at: string }[], now = Date.now()): { title: string; body: string } | null {
  if (rows.length === 0) return null;
  const units = Math.round(rows.reduce((s, r) => s + Number(r.units), 0) * 100) / 100;
  const oldest = Math.min(...rows.map((r) => Date.parse(r.created_at)));
  const hours = Math.max(0, Math.floor((now - oldest) / 3_600_000));
  const waited = hours < 24 ? `${hours} hour${hours === 1 ? "" : "s"}` : `${Math.floor(hours / 24)} day${Math.floor(hours / 24) === 1 ? "" : "s"}`;
  const etb = (units * ETB_PER_UNIT).toLocaleString("en-US");
  return {
    title: `⏳ ${rows.length} withdrawal${rows.length === 1 ? "" : "s"} waiting`,
    body: `${units} Units (${etb} ETB) to send by Telebirr/CBE. The oldest has waited ${waited}. Open Players → Pending withdrawals.`,
  };
}

export async function sendWithdrawalDigest(): Promise<string> {
  const admin = createAdminClient();
  const { data: pending } = await admin.from("withdrawal_requests").select("units, created_at").eq("status", "pending");
  const text = withdrawalDigestText((pending ?? []) as { units: number; created_at: string }[]);
  if (!text) return "nothing waiting";

  const { data: admins } = await admin.from("profiles").select("id").eq("is_admin", true);
  const adminIds = ((admins ?? []) as { id: string }[]).map((a) => a.id);
  if (adminIds.length === 0) return "no admins";

  // At most one message a day.
  const since = new Date(Date.now() - 20 * 3_600_000).toISOString();
  const { count } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("kind", KIND).gte("created_at", since);
  if ((count ?? 0) > 0) return "already sent today";

  await admin.from("notifications").insert(
    adminIds.map((user_id) => ({ user_id, kind: KIND, title: text.title, body: text.body, link: "/admin/players", push: true })),
  );
  await pushNotifications(adminIds);
  return `sent to ${adminIds.length} admin(s)`;
}
