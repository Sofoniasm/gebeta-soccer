"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { ETB_PER_UNIT, MAX_DEPOSIT_UNITS, MIN_DEPOSIT_UNITS } from "@/lib/money";
import { getSiteSettings } from "@/lib/site-settings";
import { createNowPaymentsInvoice, nowPaymentsEnabled } from "@/lib/nowpayments";
import { externalIdFor, usdForUnits } from "@/lib/crypto-pay";

export type FormState = { ok?: boolean; message?: string } | undefined;

export async function requestWithdrawal(_prev: FormState, formData: FormData): Promise<FormState> {
  const units = Number(formData.get("units"));
  const phone = normalizeEthiopianPhone(String(formData.get("phone") ?? ""));
  if (!Number.isFinite(units) || units < 1) return { ok: false, message: "Minimum withdrawal is 1 unit." };
  if (!phone) return { ok: false, message: "Enter a valid Telebirr phone number." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_withdrawal", { p_units: units, p_phone: phone });
  if (error) {
    const m = error.message;
    if (m.includes("phone not verified")) return { ok: false, message: "Please confirm your phone number first." };
    if (m.includes("keep 1 unit")) return { ok: false, message: "You can withdraw everything except 1 Unit (200 ETB), which keeps your account open." };
    if (m.includes("insufficient")) return { ok: false, message: "You don't have enough units for that." };
    if (m.includes("too many")) return { ok: false, message: "You already have 3 pending withdrawals. Please wait for them to be paid." };
    return { ok: false, message: "Could not submit. Please try again." };
  }
  // Tell every admin (site + Telegram) so the cash goes out quickly, and give the player a record.
  try {
    const { data: auth } = await supabase.auth.getUser();
    const admin = createAdminClient();
    const [{ data: p }, { data: admins }] = await Promise.all([
      admin.from("profiles").select("id, username").eq("id", auth.user?.id ?? "").single(),
      admin.from("profiles").select("id").eq("is_admin", true),
    ]);
    const etb = (units * ETB_PER_UNIT).toLocaleString("en-US");
    const rows = ((admins ?? []) as { id: string }[]).map((a) => ({
      user_id: a.id,
      kind: "admin",
      title: "💸 Withdrawal request",
      body: `${p?.username ?? "A player"} asks for ${units} Units (${etb} ETB) to Telebirr ${phone}. Send the money, then press Approve in Admin → Players.`,
      link: "/admin/players",
    }));
    if (p) {
      rows.push({
        user_id: p.id,
        kind: "withdrawal",
        title: "⏳ Withdrawal requested",
        body: `${units} Units (${etb} ETB) are on hold and will be sent to Telebirr ${phone}. You'll get a message when it's paid.`,
        link: "/wallet",
      });
    }
    if (rows.length) await admin.from("notifications").insert(rows);
    await pushNotifications();
  } catch (e) {
    console.error("withdrawal notify:", (e as Error).message); // the request itself is already saved
  }

  revalidatePath("/wallet");
  revalidatePath("/dashboard");
  return { ok: true, message: "Withdrawal requested. The units are on hold and we'll send the money to your Telebirr soon." };
}

// ------------------------------------------------------------ crypto deposits (NOWPayments)
export type CryptoState = { ok?: boolean; message?: string; url?: string } | undefined;

/** Make a NOWPayments invoice (price in USD, player picks the coin) and return its payment link. */
export async function startCryptoDeposit(_prev: CryptoState, formData: FormData): Promise<CryptoState> {
  const units = Math.round(Number(formData.get("units")) * 2) / 2;
  if (!nowPaymentsEnabled()) return { ok: false, message: "Crypto payments are not available right now. Please message our Telegram admin." };
  if (!Number.isFinite(units) || units < MIN_DEPOSIT_UNITS || units > MAX_DEPOSIT_UNITS) {
    return { ok: false, message: `Choose between ${MIN_DEPOSIT_UNITS} and ${MAX_DEPOSIT_UNITS} Units.` };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false, message: "Please log in again." };
  const admin = createAdminClient();

  // Check BEFORE the player pays, so a payment never gets stuck.
  const { data: me } = await admin.from("profiles").select("date_of_birth").eq("id", userId).single();
  if (!me?.date_of_birth) return { ok: false, message: "Add your date of birth on your Profile first (18+ only)." };
  if (ageOn(me.date_of_birth as string) < 18) return { ok: false, message: "You must be 18 or older to play." };
  const [{ data: limit }, { data: used }] = await Promise.all([
    admin.rpc("effective_deposit_limit", { p_user_id: userId }),
    admin.rpc("deposits_last_7_days", { p_user_id: userId }),
  ]);
  if (limit !== null && limit !== undefined && Number(used ?? 0) + units > Number(limit)) {
    const left = Math.max(0, Number(limit) - Number(used ?? 0));
    return { ok: false, message: `This is over your weekly deposit limit. You can add ${left} more Units this week.` };
  }
  const since = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin.from("crypto_deposits").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending").gte("created_at", since);
  if ((count ?? 0) >= 3) return { ok: false, message: "You already have 3 unpaid crypto invoices. Pay one, or wait an hour." };

  const site = await getSiteSettings();
  const usd = usdForUnits(units, site.crypto_usd_per_unit);
  const { data: row, error } = await admin
    .from("crypto_deposits")
    .insert({ user_id: userId, units, usd, chain: "ANY", provider: "nowpayments" })
    .select("id")
    .single();
  if (error || !row) return { ok: false, message: "Could not start the payment. Did the admin run the 0042 and 0043 SQL?" };
  try {
    const inv = await createNowPaymentsInvoice({ amountUsd: usd, orderId: externalIdFor(row.id), description: `GebetaSoccer · ${units} Units` });
    await admin.from("crypto_deposits").update({ reference: inv.id, checkout_url: inv.url }).eq("id", row.id);
    revalidatePath("/wallet");
    return { ok: true, url: inv.url, message: `Pay ${usd} USD in crypto to get ${units} Units.` };
  } catch (e) {
    await admin.from("crypto_deposits").update({ status: "failed", note: (e as Error).message.slice(0, 300) }).eq("id", row.id);
    console.error("[nowpayments] invoice failed:", (e as Error).message);
    return { ok: false, message: "The crypto payment service did not answer. Please try again in a minute." };
  }
}

function ageOn(dob: string, now = new Date()): number {
  const d = new Date(`${dob.slice(0, 10)}T00:00:00Z`);
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) age--;
  return age;
}
