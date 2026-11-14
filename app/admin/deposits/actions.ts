"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { pushNotifications } from "@/lib/notify";
import { ETB_PER_UNIT, MAX_DEPOSIT_UNITS, MIN_DEPOSIT_UNITS, formatUnits } from "@/lib/money";

export interface FoundPlayer {
  id: string;
  username: string;
  phone_number: string | null;
  balance_units: number;
  /** Player's own weekly deposit limit (units) and what is left of it; null = no limit. */
  limit_units: number | null;
  limit_left: number | null;
  on_break_until: string | null;
}
export type LookupState = { player?: FoundPlayer; error?: string } | undefined;
export type DepositState = { ok?: boolean; message?: string; userId?: string; newBalance?: number } | undefined;

/** Find one player by phone number or username. */
export async function findPlayer(_prev: LookupState, formData: FormData): Promise<LookupState> {
  await requireAdminId("/admin/deposits");
  const raw = String(formData.get("identifier") ?? "").trim();
  if (!raw) return { error: "Enter a phone number or username." };

  const admin = createAdminClient();
  const phone = normalizeEthiopianPhone(raw);
  const query = admin.from("profiles").select("id, username, phone_number, balance_units, excluded_until");
  const { data } = phone
    ? await query.eq("phone_number", phone).maybeSingle()
    : await query.ilike("username", raw.replace(/^@/, "").replace(/[%_\\]/g, "\\$&")).maybeSingle();

  if (!data) return { error: `No player found for “${raw}”.` };
  const [{ data: limit }, { data: used }] = await Promise.all([
    admin.rpc("effective_deposit_limit", { p_user_id: data.id }),
    admin.rpc("deposits_last_7_days", { p_user_id: data.id }),
  ]);
  const limitUnits = limit === null || limit === undefined ? null : Number(limit);
  return {
    player: {
      id: data.id,
      username: data.username,
      phone_number: data.phone_number,
      balance_units: Number(data.balance_units),
      limit_units: limitUnits,
      limit_left: limitUnits === null ? null : Math.max(0, limitUnits - Number(used ?? 0)),
      on_break_until: data.excluded_until && new Date(data.excluded_until).getTime() > Date.now() ? data.excluded_until : null,
    },
  };
}

/** Record a Telegram deposit: ETB amount → units (1 unit = 200 ETB). */
export async function recordDeposit(_prev: DepositState, formData: FormData): Promise<DepositState> {
  const adminId = await requireAdminId("/admin/deposits");
  const userId = String(formData.get("userId") ?? "");
  const etb = Number(formData.get("etb"));
  const note = String(formData.get("note") ?? "").trim();

  if (!userId) return { ok: false, message: "Find the player first." };
  if (!Number.isFinite(etb) || etb <= 0) return { ok: false, message: "Enter the amount in ETB." };
  const units = Math.round((etb / ETB_PER_UNIT) * 100) / 100;
  if (units < MIN_DEPOSIT_UNITS || units > MAX_DEPOSIT_UNITS) {
    return { ok: false, message: `Amount must be between ${MIN_DEPOSIT_UNITS * ETB_PER_UNIT} and ${(MAX_DEPOSIT_UNITS * ETB_PER_UNIT).toLocaleString("en-US")} ETB.` };
  }

  const reference = `Telegram deposit · ${etb.toLocaleString("en-US")} ETB${note ? ` · ${note}` : ""}`;
  const { error } = await createAdminClient().rpc("admin_add_units", {
    p_user_id: userId,
    p_units: units,
    p_reference: reference,
    p_admin_id: adminId,
  });
  if (error) {
    if (error.message.includes("weekly deposit limit")) {
      return { ok: false, message: `Refused: the player set a weekly deposit limit and this would go over it (${error.message.split(": ").pop()}). Don't take their money; send it back.` };
    }
    if (error.message.includes("date of birth")) {
      return { ok: false, message: "Refused: this player hasn't added their date of birth yet. Ask them to open GebetaSoccer and confirm they're 18+, then add the deposit." };
    }
    if (error.message.includes("18 or older")) {
      return { ok: false, message: "Refused: this player is under 18. Don't take their money; send it back." };
    }
    return { ok: false, message: error.message };
  }

  const admin = createAdminClient();
  const { data: after } = await admin.from("profiles").select("username, balance_units").eq("id", userId).single();
  await pushNotifications([userId]);

  revalidatePath("/admin/deposits");
  revalidatePath("/wallet");
  return {
    ok: true,
    userId,
    newBalance: Number(after?.balance_units ?? 0),
    message: `Added ${formatUnits(units)} to ${after?.username ?? "the player"}.`,
  };
}

/**
 * Admin → Deposits → Crypto: add the Units for a crypto invoice by hand, after checking in
 * AuraPay that it really was paid (e.g. the webhook was missed, or it was paid a little short).
 */
export async function creditCryptoDeposit(formData: FormData) {
  const adminId = await requireAdminId("/admin/deposits");
  const ref = String(formData.get("reference") ?? "");
  const { data, error } = await createAdminClient().rpc("crypto_credit_deposit", {
    p_reference: ref,
    p_paid: null,
    p_tx_hash: "",
    p_event_id: "",
    p_admin_id: adminId,
  });
  const r = error ? `error: ${error.message}` : String(data);
  if (r === "credited") await pushNotifications();
  revalidatePath("/admin/deposits");
  revalidatePath("/wallet");
  redirect(`/admin/deposits?cmsg=${encodeURIComponent(`${ref}: ${r}`)}`);
}
