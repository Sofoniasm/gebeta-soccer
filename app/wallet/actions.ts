"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeEthiopianPhone } from "@/lib/phone";

export type FormState = { ok?: boolean; message?: string } | undefined;

export async function requestDeposit(_prev: FormState, formData: FormData): Promise<FormState> {
  const amount = Number(formData.get("amount"));
  const reference = String(formData.get("reference") ?? "").trim().toUpperCase();
  if (!Number.isFinite(amount) || amount < 1) return { ok: false, message: "Enter the amount you sent in ETB." };
  if (!/^[A-Z0-9-]{4,64}$/.test(reference)) return { ok: false, message: "Enter the Telebirr transaction ID from your SMS receipt." };

  const supabase = await createClient();
  const { error } = await supabase.from("deposit_requests").insert({ amount_etb: amount, method: "telebirr", reference });
  if (error) {
    if (error.code === "23505") return { ok: false, message: "That transaction ID has already been submitted." };
    return { ok: false, message: "Could not submit. Please try again." };
  }
  revalidatePath("/wallet");
  return { ok: true, message: "Deposit submitted. We'll credit your wallet as soon as we confirm the payment." };
}

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
