/**
 * Send pending notifications to players' Telegram.
 *
 * The database creates the notifications itself (triggers on the wallet and
 * withdrawals). After any admin action that moves money we call
 * `pushNotifications()`: it claims the unsent ones (so two calls can never
 * send the same message twice) and the bot delivers them.
 * Players who haven't linked Telegram simply see them in the app.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessage, telegramEnabled } from "@/lib/telegram";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://gebeta-soccer.vercel.app";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

interface Pending {
  id: number;
  user_id: string;
  title: string;
  body: string | null;
  link: string | null;
}

export async function pushNotifications(userIds?: string[]): Promise<void> {
  if (!telegramEnabled()) return;
  try {
    const admin = createAdminClient();

    // Claim: mark as sent first, in one statement; only rows we flipped are ours.
    let claim = admin
      .from("notifications")
      .update({ telegram_sent_at: new Date().toISOString() })
      .eq("push", true)
      .is("telegram_sent_at", null)
      .gte("created_at", new Date(Date.now() - 24 * 3600 * 1000).toISOString());
    if (userIds?.length) claim = claim.in("user_id", userIds);
    const { data: claimed, error } = await claim.select("id, user_id, title, body, link");
    if (error || !claimed?.length) return;

    const rows = claimed as Pending[];
    const ids = [...new Set(rows.map((r) => r.user_id))];
    const { data: profiles } = await admin.from("profiles").select("id, telegram_user_id").in("id", ids);
    const chatOf = new Map((profiles ?? []).map((p: { id: string; telegram_user_id: number | null }) => [p.id, p.telegram_user_id]));

    await Promise.all(
      rows.map(async (n) => {
        const chat = chatOf.get(n.user_id);
        if (!chat) return;
        const text = `<b>${esc(n.title)}</b>\n${esc(n.body ?? "")}`;
        // "Open" button opens the right page inside the Telegram Mini App
        const open = `${SITE}/tma?next=${encodeURIComponent(n.link ?? "/dashboard")}`;
        const res = await sendMessage(Number(chat), text, {
          disable_web_page_preview: true,
          reply_markup: { inline_keyboard: [[{ text: "Open GebetaSoccer", web_app: { url: open } }]] },
        });
        if (!res.ok) console.error("telegram notify failed:", res.description);
      }),
    );
  } catch (e) {
    // Notifications must never break the money action itself.
    console.error("pushNotifications:", (e as Error).message);
  }
}
