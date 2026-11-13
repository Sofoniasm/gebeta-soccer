"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeEthiopianPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { ETB_PER_UNIT } from "@/lib/money";

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
