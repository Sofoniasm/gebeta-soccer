import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { formatKickoff } from "@/lib/format";
import { SubmitButton } from "../SubmitButton";

export const metadata = { title: "Support · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

async function closeRequest(formData: FormData) {
  "use server";
  await requireAdminId("/admin/support");
  const id = Number(formData.get("id"));
  const note = String(formData.get("note") ?? "").trim() || null;
  await createAdminClient().from("support_requests").update({ status: "done", admin_note: note, closed_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/admin/support");
  redirect("/admin/support");
}

type Contact = { username?: string | null; phone?: string | null; telegram_id?: number | null; telegram_username?: string | null; telegram_name?: string | null };
type Req = { id: number; user_id: string | null; chat_id: number | null; channel: string; question: string; summary: string | null; contact: Contact | null; status: string; admin_note: string | null; created_at: string; profiles: { username: string; phone_number: string | null } | null };
type Msg = { id: number; channel: string; question: string; answer: string | null; escalated: boolean; created_at: string; profiles: { username: string } | null };

export default async function SupportPage() {
  await requireAdminId("/admin/support");
  const admin = createAdminClient();
  const [{ data: open }, { data: done }, { data: recent }, { count: today }] = await Promise.all([
    admin.from("support_requests").select("*, profiles(username, phone_number)").eq("status", "open").order("created_at", { ascending: false }),
    admin.from("support_requests").select("*, profiles(username, phone_number)").eq("status", "done").order("closed_at", { ascending: false }).limit(20),
    admin.from("assistant_messages").select("id, channel, question, answer, escalated, created_at, profiles(username)").order("created_at", { ascending: false }).limit(40),
    admin.from("assistant_messages").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
  ]);
  const openList = (open ?? []) as unknown as Req[];
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";
  const who = (r: Req) =>
    r.profiles ? (
      <Link href={`/admin/players/${r.user_id}`} className="font-bold text-lilac">{r.profiles.username}</Link>
    ) : (
      <b>{r.chat_id ? `Telegram chat ${r.chat_id} (not linked)` : "Visitor"}</b>
    );

  return (
    <AppShell title="Support" next="/admin/support">
      <p className="mb-5 text-sm text-mist">
        The help assistant answers players on the website (Help page) and in the Telegram bot. Money problems, disputes and account issues come here.{" "}
        {process.env.ANTHROPIC_API_KEY ? <b className="text-emerald-200">Assistant is on.</b> : <b className="text-amber-100">Assistant is off: add ANTHROPIC_API_KEY in Vercel.</b>}{" "}
        {process.env.RESEND_API_KEY ? `Emails go to ${process.env.SUPPORT_EMAIL || "admin@gebetasoccer.com"}.` : "Email alerts are off: add RESEND_API_KEY in Vercel."} · {today ?? 0} questions in the last 24 h.
      </p>

      <section className={`${card} mb-5 ${openList.length ? "border-amber-200/30" : ""}`}>
        <h2 className="mb-3 text-lg font-extrabold">Waiting for you ({openList.length})</h2>
        {openList.length === 0 ? (
          <p className="text-sm text-mist">Nothing waiting.</p>
        ) : (
          <ul className="space-y-4">
            {openList.map((r) => (
              <li key={r.id} className="rounded-2xl border border-white/10 bg-ink/40 p-4 text-sm">
                <p className="text-xs text-mist">#{r.id} · {formatKickoff(r.created_at)} EAT · {r.channel}{r.profiles?.phone_number ? ` · ${r.profiles.phone_number}` : ""}</p>
                <p className="mt-1">{who(r)}: <span className="text-white">“{r.question}”</span></p>
                {r.summary && <p className="mt-2 text-xs text-mist">Issue: {r.summary}</p>}
                {r.contact && (
                  <p className="mt-1 text-xs text-mist">
                    Contact: {[r.contact.phone, r.contact.telegram_username, r.contact.telegram_name, r.contact.telegram_id ? `Telegram ID ${r.contact.telegram_id}` : null].filter(Boolean).join(" · ") || "none"}
                    {r.contact.telegram_username && (
                      <> · <a href={`https://t.me/${r.contact.telegram_username.slice(1)}`} target="_blank" rel="noopener noreferrer" className="font-bold text-lilac">Message on Telegram</a></>
                    )}
                  </p>
                )}
                <form action={closeRequest} className="mt-3 flex flex-wrap gap-2">
                  <input type="hidden" name="id" value={r.id} />
                  <input name="note" placeholder="What you did (optional)" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-ink/70 px-3 py-2 text-sm outline-none focus:border-lilac" />
                  <SubmitButton className="rounded-full border border-white/40 px-4 py-2 text-xs font-bold uppercase tracking-wider">Mark done</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Latest questions</h2>
          <ul className="space-y-3 text-sm">
            {((recent ?? []) as unknown as Msg[]).map((m) => (
              <li key={m.id} className="border-b border-white/5 pb-3 last:border-0">
                <p className="text-xs text-mist">{formatKickoff(m.created_at)} · {m.channel} · {m.profiles?.username ?? "visitor"}{m.escalated ? " · 🆘 handed over" : ""}</p>
                <p className="text-white">{m.question}</p>
                {m.answer && <p className="mt-1 line-clamp-3 text-xs text-mist">{m.answer}</p>}
              </li>
            ))}
            {(recent ?? []).length === 0 && <li className="text-mist">No questions yet.</li>}
          </ul>
        </section>
        <section className={card}>
          <h2 className="mb-3 text-lg font-extrabold">Done</h2>
          <ul className="space-y-2 text-sm">
            {((done ?? []) as unknown as Req[]).map((r) => (
              <li key={r.id}>
                #{r.id} {who(r)}: <span className="text-mist">{r.question.slice(0, 90)}</span>
                {r.admin_note && <span className="block text-xs text-emerald-200">✓ {r.admin_note}</span>}
              </li>
            ))}
            {(done ?? []).length === 0 && <li className="text-mist">None yet.</li>}
          </ul>
        </section>
      </div>
    </AppShell>
  );
}
