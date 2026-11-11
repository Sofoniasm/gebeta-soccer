import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";

export const revalidate = 3600; // rebuilt at most once an hour

/** /sitemap.xml — every public page plus every published news article. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
    { path: "", priority: 1, changeFrequency: "daily" },
    { path: "/how-to-play", priority: 0.9, changeFrequency: "monthly" },
    { path: "/tournaments", priority: 0.8, changeFrequency: "weekly" },
    { path: "/news", priority: 0.8, changeFrequency: "daily" },
    { path: "/apps", priority: 0.6, changeFrequency: "monthly" },
    { path: "/about", priority: 0.5, changeFrequency: "yearly" },
    { path: "/business", priority: 0.5, changeFrequency: "yearly" },
    { path: "/register", priority: 0.7, changeFrequency: "yearly" },
    { path: "/terms", priority: 0.3, changeFrequency: "yearly" },
  ];
  const entries: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${SITE_URL}${p.path}`,
    lastModified: now,
    changeFrequency: p.changeFrequency,
    priority: p.priority,
  }));

  try {
    if (SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
      const { data } = await supabase
        .from("news_posts")
        .select("slug, published_at, cover_image")
        .order("published_at", { ascending: false })
        .limit(1000);
      for (const n of (data ?? []) as { slug: string; published_at: string; cover_image: string }[]) {
        entries.push({
          url: `${SITE_URL}/news/${n.slug}`,
          lastModified: new Date(n.published_at),
          changeFrequency: "monthly",
          priority: 0.6,
          images: [`${SITE_URL}${n.cover_image}`],
        });
      }
    }
  } catch {
    /* sitemap still works without the news list */
  }
  return entries;
}
