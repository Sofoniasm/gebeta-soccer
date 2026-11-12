"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { PLANS, premiumError, type Plan } from "@/lib/premium";

type Result = { ok: boolean; message: string };

export async function buyPremium(plan: Plan): Promise<Result> {
  if (!(plan in PLANS)) return { ok: false, message: "Choose monthly or yearly." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("buy_premium", { p_plan: plan });
  if (error) return { ok: false, message: premiumError(error.message) };
  revalidatePath("/", "layout");
  const until = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "long", year: "numeric" }).format(new Date(String(data)));
  return { ok: true, message: `Welcome to Gebeta Premium ⭐ Active until ${until}.` };
}

export async function setAutoRenew(on: boolean): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_premium_auto_renew", { p_on: on });
  if (error) return { ok: false, message: "Could not save. Please try again." };
  revalidatePath("/premium");
  return { ok: true, message: on ? "Auto-renew is on." : "Auto-renew is off. Premium stays until the end of the period." };
}
