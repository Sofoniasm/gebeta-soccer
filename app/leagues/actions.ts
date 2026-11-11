"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LeagueFormState = { ok?: boolean; message?: string } | undefined;

function friendly(m: string): string {
  if (m.includes("phone not verified")) return "Please confirm your phone number first.";
  if (m.includes("insufficient")) return "Not enough units in your wallet. Top up on Telegram, or choose “Request to join”.";
  if (m.includes("entry fee must be")) return "Entry fee must be free, or 5–50 Units (1,000–10,000 ETB).";
  if (m.includes("at most 5")) return "You can run at most 5 open leagues at a time.";
  if (m.includes("round is not open")) return "That round is no longer open. Pick another one.";
  if (m.includes("league not found")) return "No league with that code. Check the code and try again.";
  if (m.includes("league is closed")) return "This league is closed — its round has already started or finished.";
  if (m.includes("char_length") || m.includes("leagues_name_check")) return "League name must be 3–40 characters.";
  return "Something went wrong. Please try again.";
}

export async function createLeague(_prev: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  const name = String(formData.get("name") ?? "").trim();
  const roundId = Number(formData.get("roundId"));
  const paid = formData.get("type") === "paid";
  const fee = paid ? Number(formData.get("fee")) : 0;
  if (name.length < 3 || name.length > 40) return { ok: false, message: "League name must be 3–40 characters." };
  if (!roundId) return { ok: false, message: "Choose the round your league plays." };
  if (paid && (!Number.isFinite(fee) || fee < 5 || fee > 50)) {
    return { ok: false, message: "Entry fee must be 5–50 Units (1,000–10,000 ETB)." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_league", { p_name: name, p_round_id: roundId, p_fee: fee, p_pay: true });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath("/leagues");
  redirect(`/leagues/${data as string}?created=1`);
}

export async function joinLeague(_prev: LeagueFormState, formData: FormData): Promise<LeagueFormState> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const pay = formData.get("pay") === "wallet";
  if (!/^GEBETA-[A-Z0-9]{4}$/.test(code)) return { ok: false, message: "Codes look like GEBETA-X7F9." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league", { p_code: code, p_pay: pay });
  if (error) return { ok: false, message: friendly(error.message) };
  revalidatePath("/leagues");
  revalidatePath(`/leagues/${code}`);
  revalidatePath("/dashboard");
  if (data === "pending") {
    return { ok: true, message: "Request sent! Send the entry fee to the admin on Telegram — you're in as soon as it's confirmed." };
  }
  redirect(`/leagues/${code}`);
}

/** "Join with code" box on /leagues just opens the league page. */
export async function openLeagueByCode(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "").trim().toUpperCase().replace(/^GEBETA-?/, "GEBETA-");
  redirect(`/leagues/${encodeURIComponent(code)}`);
}
