import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { formatKickoff } from "@/lib/format";
import { TELEGRAM_BOT_USERNAME } from "@/lib/telegram";
import { AppShell } from "@/components/AppShell";
import { BellIcon, SendIcon } from "@/components/icons";

export const metadata = { title: "Notifications · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface Note {
  id: number;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export default async function NotificationsPage() {
  await getMe("/notifications");
  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("id, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(60);
  const notes = (data ?? []) as Note[];

  // Opening this page marks everything as read (the "new" dots show this once).
  if (notes.some((n) => !n.read_at)) await supabase.rpc("mark_notifications_read");

  return (
    <AppShell title="Notifications" next="/notifications">
      {TELEGRAM_BOT_USERNAME && (
        <a
          href={`https://t.me/${TELEGRAM_BOT_USERNAME}`}
          target="_blank"
          rel="noreferrer"
          className="mb-5 flex items-center gap-3 rounded-2xl border border-[#2aabee]/30 bg-[#2aabee]/10 p-4 text-sm text-mist hover:border-[#2aabee]/60"
        >
          <SendIcon size={18} className="shrink-0 text-[#7fd0f7]" />
          <span>
            Deposits, withdrawals and winnings are also sent to you on Telegram by{" "}
            <b className="text-white">@{TELEGRAM_BOT_USERNAME}</b>.
          </span>
        </a>
      )}

      {notes.length === 0 ? (
        <div className="rounded-[2rem] border border-white/5 bg-card/60 p-10 text-center">
          <BellIcon size={28} className="mx-auto text-lilac" />
          <p className="mt-3 font-bold">No notifications yet</p>
          <p className="mt-1 text-sm text-mist">Deposits, round results and withdrawals will show up here.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notes.map((n) => {
            const inner = (
              <div
                className={`flex gap-3 rounded-2xl border p-4 transition ${
                  n.read_at ? "border-white/5 bg-card/50" : "border-lilac/30 bg-lilac/10"
                } ${n.link ? "hover:border-lilac/50" : ""}`}
              >
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-rose-500"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-bold">{n.title}</p>
                    <p className="text-xs text-mist">{formatKickoff(n.created_at)}</p>
                  </div>
                  {n.body && <p className="mt-1 text-sm text-mist">{n.body}</p>}
                </div>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link}>{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </AppShell>
  );
}
