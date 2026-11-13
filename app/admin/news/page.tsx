import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { formatNewsDate, newsStatus, toAddisInput, type NewsPost } from "@/lib/news";
import { formatKickoff } from "@/lib/format";
import { SubmitButton } from "../SubmitButton";
import { NewsEditor } from "./NewsEditor";
import { deleteNews, unpublishNews } from "./actions";

export const metadata = { title: "News · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const BADGE = {
  live: "bg-emerald-400/15 text-emerald-200",
  scheduled: "bg-amber-300/15 text-amber-100",
  draft: "bg-white/10 text-mist",
} as const;
const BADGE_LABEL = { live: "Live", scheduled: "Scheduled", draft: "Draft" } as const;

export default async function AdminNewsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; edit?: string; new?: string }> }) {
  await requireAdminId("/admin/news");
  const { msg, err, edit, new: isNew } = await searchParams;
  const admin = createAdminClient();
  const { data } = await admin
    .from("news_posts")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(200);
  const posts = (data ?? []) as NewsPost[];
  const now = Date.now();

  const editing = edit ? posts.find((p) => p.id === Number(edit)) ?? null : null;
  const showEditor = Boolean(isNew) || Boolean(editing);
  const editorPost = editing
    ? { ...editing, status: newsStatus(editing, now), scheduleValue: toAddisInput(editing.published_at) }
    : null;
  const defaultSchedule = toAddisInput(new Date(now + 3600 * 1000).toISOString());
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";
  const counts = { live: 0, scheduled: 0, draft: 0 };
  for (const p of posts) counts[newsStatus(p, now)]++;

  return (
    <AppShell title="News" next="/admin/news">
      {msg && <div className="mb-4"><Banner kind="success">{msg}</Banner></div>}
      {err && <div className="mb-4"><Banner kind="error">{err}</Banner></div>}

      {showEditor ? (
        <section className={`${card} mb-5`}>
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold">{editing ? "Edit article" : "New article"}</h2>
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider">
              {editing && (
                <Link href={`/news/${editing.slug}`} target="_blank" className="text-lilac hover:text-lilac-soft">
                  {newsStatus(editing, now) === "live" ? "View" : "Preview"}
                </Link>
              )}
              <Link href="/admin/news" className="text-mist hover:text-white">Close</Link>
            </div>
          </div>
          <NewsEditor key={editing?.id ?? "new"} post={editorPost} defaultSchedule={defaultSchedule} />
          {editing && (
            <div className="mt-5 flex flex-wrap gap-3 border-t border-white/5 pt-5">
              {newsStatus(editing, now) !== "draft" && (
                <form action={unpublishNews}>
                  <input type="hidden" name="id" value={editing.id} />
                  <SubmitButton confirm="Hide it from players?" className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">
                    Unpublish
                  </SubmitButton>
                </form>
              )}
              <form action={deleteNews}>
                <input type="hidden" name="id" value={editing.id} />
                <SubmitButton confirm="Delete this article for good?" className="rounded-full border border-rose-300/40 px-4 py-2 text-xs font-bold uppercase tracking-wider text-rose-200 hover:bg-rose-500/15">
                  Delete
                </SubmitButton>
              </form>
            </div>
          )}
        </section>
      ) : (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-mist">
            <b className="text-white">{counts.live}</b> live · <b className="text-white">{counts.scheduled}</b> scheduled · <b className="text-white">{counts.draft}</b> drafts
          </p>
          <Link href="/admin/news?new=1" className="inline-flex items-center justify-center rounded-full bg-lilac px-5 py-3 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
            + Write article
          </Link>
        </div>
      )}

      <section className={card}>
        <h2 className="mb-4 text-lg font-extrabold">All articles</h2>
        {posts.length === 0 && <p className="text-sm text-mist">No articles yet. Write the first one.</p>}
        <ul className="divide-y divide-white/5">
          {posts.map((p) => {
            const st = newsStatus(p, now);
            return (
              <li key={p.id} className={`flex items-center gap-3 py-3 ${editing?.id === p.id ? "opacity-60" : ""}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.cover_image} alt="" loading="lazy" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${BADGE[st]}`}>{BADGE_LABEL[st]}</span>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-lilac">{p.tag}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-bold">{p.title}</p>
                  <p className="text-xs text-mist">
                    {st === "scheduled" ? `Goes live ${formatKickoff(p.published_at)}` : st === "draft" ? "Not visible to players" : formatNewsDate(p.published_at)}
                  </p>
                </div>
                <Link href={`/admin/news?edit=${p.id}`} className="shrink-0 rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">
                  Edit
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
