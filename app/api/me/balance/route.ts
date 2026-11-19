/**
 * GET /api/me/balance — the signed-in player's own wallet balance, so the
 * balance shown in the sidebar / top bar stays right when it changes in
 * another tab or in the Telegram Mini App. Only ever the caller's own row.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/auth-user";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("balance_units").eq("id", user.id).single();
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ units: Number(data.balance_units) }, { headers: { "Cache-Control": "no-store" } });
}
