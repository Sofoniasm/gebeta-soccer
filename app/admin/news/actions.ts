"use server";

/**
 * Admin -> News. Every action checks the caller is an admin, then writes with
 * the secret-key client (players can never write news themselves).
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { NEWS_TAGS, autoExcerpt, fromAddisInput, slugify } from "@/lib/news";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const IMAGE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function back(kind: "msg" | "err", text: string, edit?: number | string): never {
  revalidatePath("/news", "layout");
  revalidatePath("/admin/news");
  revalidatePath("/sitemap.xml");
  const e = edit ? `&edit=${edit}` : "";
  redirect(`/admin/news?${kind}=${encodeURIComponent(text)}${e}`);
}

async function uniqueSlug(admin: ReturnType<typeof createAdminClient>, wanted: string, id: number | null): Promise<string> {
  let base = slugify(wanted);
  if (base.length < 3) base = `news-${Date.now().toString(36)}`;
  for (let n = 1; n < 50; n++) {
    const candidate = n === 1 ? base : `${base.slice(0, 70)}-${n}`;
    const { data } = await admin.from("news_posts").select("id").eq("slug", candidate).maybeSingle();
    if (!data || (id !== null && data.id === id)) return candidate;
  }
  return `${base.slice(0, 60)}-${Date.now().toString(36)}`;
}

export async function saveNews(formData: FormData) {
  const adminId = await requireAdminId("/admin/news");
  const admin = createAdminClient();

  const idRaw = String(formData.get("id") ?? "");
  const id = idRaw ? Number(idRaw) : null;
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  let excerpt = String(formData.get("excerpt") ?? "").trim();
  const tagIn = String(formData.get("tag") ?? "News");
  const tag = (NEWS_TAGS as readonly string[]).includes(tagIn) ? tagIn : "News";
  const mode = String(formData.get("mode") ?? "publish"); // publish | schedule | draft
  const notify = formData.get("notify") === "on";
  const slugIn = String(formData.get("slug") ?? "").trim();
  const titleAm = String(formData.get("title_am") ?? "").trim().slice(0, 200);
  const excerptAm = String(formData.get("excerpt_am") ?? "").trim().slice(0, 400);
  const bodyAm = String(formData.get("body_am") ?? "").trim();

  if (title.length < 3 || title.length > 140) back("err", "Title must be 3 to 140 characters.", id ?? undefined);
  if (body.length < 20) back("err", "Write at least a couple of sentences in the article.", id ?? undefined);
  if (!excerpt) excerpt = autoExcerpt(body);
  if (excerpt.length > 300) excerpt = `${excerpt.slice(0, 297)}…`;

  // Cover: an uploaded photo wins, then a pasted link, then a built-in picture.
  let cover = String(formData.get("cover_choice") ?? "/stadium.webp");
  const coverUrl = String(formData.get("cover_url") ?? "").trim();
  if (coverUrl) {
    if (!/^https:\/\/\S+$/i.test(coverUrl)) back("err", "The cover image link must start with https://", id ?? undefined);
    cover = coverUrl;
  }
  const file = formData.get("cover_file");
  if (file instanceof File && file.size > 0) {
    const ext = IMAGE_TYPES[file.type];
    if (!ext) back("err", "Cover photo must be a JPG, PNG or WebP image.", id ?? undefined);
    if (file.size > MAX_IMAGE_BYTES) back("err", "Cover photo is too big (max 3 MB).", id ?? undefined);
    const path = `covers/${Date.now()}-${slugify(title).slice(0, 40) || "cover"}.${ext}`;
    const up = await admin.storage.from("news").upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) back("err", `Photo upload failed: ${up.error.message}. Did you run the 0020 SQL?`, id ?? undefined);
    cover = admin.storage.from("news").getPublicUrl(path).data.publicUrl;
  }
  if (!/^(\/[a-z0-9._\-/]+|https:\/\/\S+)$/i.test(cover)) cover = "/stadium.webp";

  let publishedAt = new Date();
  let isPublished = true;
  if (mode === "draft") isPublished = false;
  if (mode === "schedule") {
    const when = fromAddisInput(String(formData.get("publish_at") ?? ""));
    if (!when) back("err", "Pick the date and time to publish.", id ?? undefined);
    if (when.getTime() < Date.now() - 60_000) back("err", "The scheduled time is in the past. Use Publish now instead.", id ?? undefined);
    publishedAt = when;
  }

  // When editing an article that is already live, keep its original date.
  let existing: { published_at: string; is_published: boolean; slug: string } | null = null;
  if (id !== null) {
    const { data } = await admin.from("news_posts").select("published_at, is_published, slug").eq("id", id).maybeSingle();
    if (!data) back("err", "That article no longer exists.");
    existing = data;
    const wasLive = data.is_published && new Date(data.published_at).getTime() <= Date.now();
    if (mode === "publish" && wasLive) publishedAt = new Date(data.published_at);
  }

  const slug = await uniqueSlug(admin, slugIn || existing?.slug || title, id);
  const row = {
    slug,
    title,
    excerpt,
    body,
    cover_image: cover,
    tag,
    is_published: isPublished,
    published_at: publishedAt.toISOString(),
    updated_at: new Date().toISOString(),
    // Amharic (migration 0036 must be run first). Empty = English is shown on /am pages.
    ...(formData.has("title_am") ? { title_am: titleAm, excerpt_am: excerptAm, body_am: bodyAm } : {}),
  };

  let savedId = id;
  if (id === null) {
    const { data, error } = await admin.from("news_posts").insert({ ...row, author_id: adminId }).select("id").single();
    if (error) back("err", `Could not save: ${error.message}`);
    savedId = data.id;
  } else {
    const { error } = await admin.from("news_posts").update(row).eq("id", id);
    if (error) back("err", `Could not save: ${error.message}`, id);
  }

  let told = 0;
  if (notify && mode === "publish") {
    const { data: players } = await admin.from("profiles").select("id");
    const rows = (players ?? []).map((p: { id: string }) => ({
      user_id: p.id,
      kind: "news",
      title: `📰 ${title}`,
      body: excerpt,
      link: `/news/${slug}`,
      push: true,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      await admin.from("notifications").insert(rows.slice(i, i + 500));
    }
    told = rows.length;
    await pushNotifications();
  }

  const what = mode === "draft" ? "Draft saved" : mode === "schedule" ? "Scheduled" : id === null ? "Published" : "Saved";
  back("msg", told ? `${what}. ${told} players notified in the app and on Telegram.` : `${what}.`, savedId ?? undefined);
}

export async function deleteNews(formData: FormData) {
  await requireAdminId("/admin/news");
  const id = Number(formData.get("id"));
  if (!id) back("err", "Missing article.");
  const admin = createAdminClient();
  const { data } = await admin.from("news_posts").select("cover_image").eq("id", id).maybeSingle();
  const { error } = await admin.from("news_posts").delete().eq("id", id);
  if (error) back("err", `Could not delete: ${error.message}`);
  // Remove an uploaded cover photo too (built-in pictures are left alone).
  const m = data?.cover_image?.match(/\/storage\/v1\/object\/public\/news\/(.+)$/);
  if (m) await admin.storage.from("news").remove([decodeURIComponent(m[1])]);
  back("msg", "Article deleted.");
}

export async function unpublishNews(formData: FormData) {
  await requireAdminId("/admin/news");
  const id = Number(formData.get("id"));
  const admin = createAdminClient();
  const { error } = await admin.from("news_posts").update({ is_published: false, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) back("err", `Could not unpublish: ${error.message}`, id);
  back("msg", "Moved back to drafts. Players can no longer see it.", id);
}
