import type { MetadataRoute } from "next";
import { createClient } from "@supabase/supabase-js";
import { SITE_URL } from "@/lib/site";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "@/lib/env";
import { absoluteImage } from "@/lib/news";
import { predictionPath } from "@/lib/predictions";
import { isTranslatable, localPath } from "@/lib/i18n";

export const revalidate = 3600; // rebuilt at most once an hour

/** /sitemap.xml — every public page plus every published news article. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const pages: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" | "yearly" }[] = [
    { path: "", priority: 1, changeFrequency: "daily" },
    { path: "/predictions", priority: 0.9, changeFrequency: "daily" },
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
          images: [absoluteImage(n.cover_image, SITE_URL)],
        });
      }

      // Match prediction pages that may be indexed: a published preview, or a match in a live round.
      type M = { id: number; home_team: string; away_team: string; kickoff_at: string; updated_at: string };
      const since = new Date(Date.now() - 60 * 86400 * 1000).toISOString();
      const [{ data: tipped }, { data: liveRounds }] = await Promise.all([
        supabase.from("matches").select("id, home_team, away_team, kickoff_at, updated_at, match_previews!inner(updated_at)").gte("kickoff_at", since).neq("provider", "test").limit(2000),
        supabase.from("rounds").select("id").in("status", ["open", "locked", "settled"]),
      ]);
      const ids = ((liveRounds ?? []) as { id: number }[]).map((r) => r.id);
      const { data: roundMatches } = ids.length
        ? await supabase.from("matches").select("id, home_team, away_team, kickoff_at, updated_at").in("round_id", ids).gte("kickoff_at", since).neq("provider", "test").limit(2000)
        : { data: [] };
      const seen = new Set<number>();
      for (const m of [...((tipped ?? []) as M[]), ...((roundMatches ?? []) as M[])]) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        const upcoming = new Date(m.kickoff_at).getTime() > Date.now();
        entries.push({
          url: `${SITE_URL}${predictionPath(m)}`,
          lastModified: new Date(m.updated_at),
          changeFrequency: upcoming ? "daily" : "monthly",
          priority: upcoming ? 0.8 : 0.4,
        });
      }
    }
  } catch {
    /* sitemap still works without the news list */
  }

  // Pages with an Amharic version: list both and link them (hreflang).
  const withLanguages: MetadataRoute.Sitemap = [];
  for (const e of entries) {
    const path = e.url.slice(SITE_URL.length) || "/";
    if (!isTranslatable(path) || path.startsWith("/news/")) {
      withLanguages.push(e);
      continue;
    }
    const enUrl = e.url;
    const amUrl = `${SITE_URL}${localPath(path, "am")}`;
    const alternates = { languages: { en: enUrl, am: amUrl } };
    withLanguages.push({ ...e, alternates }, { ...e, url: amUrl, alternates, priority: Math.max(0.1, (e.priority ?? 0.5) - 0.1) });
  }
  return withLanguages;
}
