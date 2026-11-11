/**
 * POST /api/telegram/miniapp/link — connect the Telegram account that opened
 * the Mini App to the GebetaSoccer account that is logged in right now.
 *
 * Requires BOTH proofs: a valid Telegram signature (initData) AND a normal
 * website login (phone + password). After this, opening the Mini App logs
 * the player in automatically.
 */
import { NextResponse, type NextRequest } from "next/server";
import { verifyInitData } from "@/lib/telegram-initdata";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return NextResponse.json({ status: "error", message: "Telegram is not set up." }, { status: 500 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ status: "login", message: "Log in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { initData?: string };
  const v = verifyInitData(String(body.initData ?? ""), token);
  if (!v.ok) return NextResponse.json({ status: "invalid", message: "Could not verify Telegram — reopen the app." }, { status: 401 });

  const admin = createAdminClient();
  const { data: me } = await admin.from("profiles").select("id, telegram_user_id, phone_verified_at").eq("id", user.id).single();
  if (!me?.phone_verified_at) return NextResponse.json({ status: "verify", message: "Confirm your phone first." }, { status: 403 });

  if (me.telegram_user_id === v.user.id) return NextResponse.json({ status: "ok" });
  if (me.telegram_user_id && me.telegram_user_id !== v.user.id) {
    return NextResponse.json(
      { status: "conflict", message: "Your GebetaSoccer account is already linked to a different Telegram account." },
      { status: 409 },
    );
  }
  const { data: other } = await admin.from("profiles").select("id").eq("telegram_user_id", v.user.id).neq("id", user.id).maybeSingle();
  if (other) {
    return NextResponse.json({ status: "conflict", message: "This Telegram account is already linked to another player." }, { status: 409 });
  }

  const { error } = await admin.from("profiles").update({ telegram_user_id: v.user.id }).eq("id", user.id).is("telegram_user_id", null);
  if (error) return NextResponse.json({ status: "error", message: "Could not link accounts." }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
