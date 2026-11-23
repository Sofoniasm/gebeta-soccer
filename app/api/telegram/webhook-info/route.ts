/**
 * GET /api/telegram/webhook-info — admin only. Shows what Telegram says about this bot's webhook: the address,
 * which updates it sends (message, callback_query), how many are waiting, and the last delivery error.
 * Used to find out why the "Open Telegram app to log in" taps do not arrive.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { tg, telegramEnabled } from "@/lib/telegram";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Log in as admin first" }, { status: 401 });
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!me?.is_admin) return NextResponse.json({ error: "Admins only" }, { status: 403 });
  if (!telegramEnabled()) return NextResponse.json({ error: "Telegram is not set up (TELEGRAM_BOT_TOKEN / TELEGRAM_BOT_USERNAME)." }, { status: 400 });

  const info = await tg("getWebhookInfo", {});
  const r = (info.result ?? {}) as Record<string, unknown>;
  const allowed = Array.isArray(r.allowed_updates) ? (r.allowed_updates as string[]) : null;
  return NextResponse.json({
    ok: info.ok,
    url: r.url ?? null,
    pending_update_count: r.pending_update_count ?? null,
    allowed_updates: allowed,
    callback_query_allowed: allowed === null ? "default (all except a few): probably yes" : allowed.includes("callback_query"),
    last_error_date: typeof r.last_error_date === "number" ? new Date((r.last_error_date as number) * 1000).toISOString() : null,
    last_error_message: r.last_error_message ?? null,
    max_connections: r.max_connections ?? null,
    secret_set_on_server: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
  });
}
