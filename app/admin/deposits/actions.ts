"use server";

import { revalidatePath } from "next/cache";
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
  const query = admin.from("profiles").select("id, username, phone_number, balance_units");
  const { data } = phone
    ? await query.eq("phone_number", phone).maybeSingle()
    : await query.ilike("username", raw.replace(/^@/, "").replace(/[%_\\]/g, "\\$&")).maybeSingle();

  if (!data) return { error: `No player found for “${raw}”.` };
  return { player: { ...data, balance_units: Number(data.balance_units) } as FoundPlayer };
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
  if (error) return { ok: false, message: error.message };

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
