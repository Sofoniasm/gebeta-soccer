"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeEthiopianPhone } from "@/lib/phone";

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
    if (m.includes("insufficient")) return { ok: false, message: "You don't have enough units for that." };
    if (m.includes("too many")) return { ok: false, message: "You already have 3 pending withdrawals. Please wait for them to be paid." };
    return { ok: false, message: "Could not submit. Please try again." };
  }
  revalidatePath("/wallet");
  revalidatePath("/dashboard");
  return { ok: true, message: "Withdrawal requested. The units are on hold and we'll send the money to your Telebirr soon." };
}
