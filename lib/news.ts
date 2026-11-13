export interface NewsPost {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  cover_image: string;
  tag: string;
  published_at: string;
  is_published?: boolean;
  updated_at?: string;
  title_am?: string | null;
  excerpt_am?: string | null;
  body_am?: string | null;
}

/** Use the Amharic text on /am pages when the article has it; each field falls back to English. */
export function localizeNews<T extends NewsPost>(post: T, lang: string): T {
  if (lang !== "am") return post;
  return {
    ...post,
    title: post.title_am?.trim() || post.title,
    excerpt: post.excerpt_am?.trim() || post.excerpt,
    body: post.body_am?.trim() || post.body,
  };
}

export const NEWS_TAGS = ["News", "Announcement", "Preview", "Analysis", "Results", "Guide"] as const;

/** Built-in cover photos the admin can pick without uploading anything. */
export const NEWS_COVERS = [
  { src: "/stadium.webp", label: "Stadium" },
  { src: "/ball.webp", label: "Ball" },
  { src: "/crowd.webp", label: "Crowd" },
] as const;

export function formatNewsDate(iso: string, lang: "en" | "am" = "en"): string {
  return new Intl.DateTimeFormat(lang === "am" ? "am-ET" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Addis_Ababa" }).format(new Date(iso));
}

/** Absolute URL for an image that may be a site path ("/ball.webp") or a full URL. */
export function absoluteImage(src: string, site: string): string {
  return /^https?:\/\//i.test(src) ? src : `${site}${src.startsWith("/") ? "" : "/"}${src}`;
}

/** "Arsenal vs Chelsea: preview!" -> "arsenal-vs-chelsea-preview" (fits the table's slug rule). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70)
    .replace(/-+$/g, "");
}

export type NewsStatus = "draft" | "scheduled" | "live";
export function newsStatus(p: { is_published?: boolean; published_at: string }, now = Date.now()): NewsStatus {
  if (p.is_published === false) return "draft";
  return new Date(p.published_at).getTime() > now ? "scheduled" : "live";
}

/** ISO time -> value for <input type="datetime-local"> in Addis Ababa time (UTC+3, no DST). */
export function toAddisInput(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value typed in Addis time -> Date. */
export function fromAddisInput(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00+03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** First ~160 characters of the body, without formatting marks, for an automatic summary. */
export function autoExcerpt(body: string): string {
  const plain = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*|^[-*>]\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= 160 ? plain : `${plain.slice(0, 157).replace(/\s+\S*$/, "")}…`;
}
