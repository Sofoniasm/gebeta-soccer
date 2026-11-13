import { PAGES } from "@/lib/i18n/pages";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { getPublicContext } from "@/lib/public";
import { createAdminClient } from "@/lib/supabase/admin";
import { absoluteImage, formatNewsDate, newsStatus, type NewsPost, localizeNews } from "@/lib/news";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { JsonLd } from "@/components/JsonLd";
import { NewsBody } from "@/components/NewsBody";
import { BRAND, breadcrumbJsonLd, pageMeta } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// "*" so the Amharic columns (title_am, excerpt_am, body_am) come along.
const COLS = "*";

/** Published article for everyone; drafts and scheduled ones only for admins (as a preview). */
/** Cached per request: the page title and the page share one load. */
const loadPost = cache(async (slug: string): Promise<{ post: NewsPost; preview: boolean; loggedIn: boolean } | null> => {
  const { supabase, loggedIn } = await getPublicContext();
  const { data } = await supabase.from("news_posts").select(COLS).eq("slug", slug).maybeSingle();
  if (data) return { post: data as NewsPost, preview: false, loggedIn };
  if (!loggedIn) return null;
  const { data: auth } = await supabase.auth.getUser();
  const { data: me } = await supabase.from("profiles").select("is_admin").eq("id", auth.user?.id ?? "").maybeSingle();
  if (!me?.is_admin) return null;
  const { data: draft } = await createAdminClient().from("news_posts").select(COLS).eq("slug", slug).maybeSingle();
  return draft ? { post: draft as NewsPost, preview: true, loggedIn } : null;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await loadPost(slug);
  if (!found) return { title: `${PAGES[await getLang()].news.notFound} | GebetaSoccer`, robots: { index: false } };
  const { preview } = found;
  const post = localizeNews(found.post, await getLang());
  const meta = pageMeta({
    title: post.title,
    description: post.excerpt,
    path: `/news/${post.slug}`,
    image: post.cover_image,
    type: "article",
    publishedTime: post.published_at,
  });
  return preview ? { ...meta, robots: { index: false, follow: false } } : meta;
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const lang = await getLang();
  const t = PAGES[lang].news;
  const { slug } = await params;
  const found = await loadPost(slug);
  if (!found) notFound();
  const { preview, loggedIn } = found;
  const post = localizeNews(found.post, lang);
  const status = newsStatus(post);

  return (
    <div className="relative">
      {!preview && (
        <>
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "NewsArticle",
              headline: post.title,
              description: post.excerpt,
              image: [absoluteImage(post.cover_image, SITE_URL)],
              datePublished: post.published_at,
              dateModified: post.updated_at ?? post.published_at,
              inLanguage: "en",
              mainEntityOfPage: `${SITE_URL}/news/${post.slug}`,
              author: { "@type": "Organization", name: BRAND, url: SITE_URL },
              publisher: { "@id": `${SITE_URL}/#organization`, "@type": "Organization", name: BRAND, logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } },
            }}
          />
          <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "" }, { name: "News", path: "/news" }, { name: post.title, path: `/news/${post.slug}` }])} />
        </>
      )}
      <SiteHeader loggedIn={loggedIn} />
      {preview && (
        <div className="sticky top-[72px] z-20 flex flex-wrap items-center justify-center gap-3 bg-amber-300 px-4 py-2 text-center text-xs font-bold text-ink">
          {status === "scheduled" ? `Scheduled preview: players see this from ${formatNewsDate(post.published_at)}` : "Draft preview: only admins can see this"}
          <Link href={`/admin/news?edit=${post.id}`} className="rounded-full bg-ink px-3 py-1 text-white">Edit</Link>
        </div>
      )}
      <article>
        <header className="relative isolate overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.cover_image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0912]/80 via-[#1a1530]/70 to-plum" />
          <div className="mx-auto max-w-3xl px-6 pb-10 pt-12 sm:pb-14 sm:pt-24">
            <Link href={localPath("/news", lang)} className="text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">{t.all}</Link>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-widest text-lilac-soft sm:mt-6">{post.tag} · {formatNewsDate(post.published_at, lang)}</p>
            <h1 className="mt-3 text-2xl font-extrabold leading-tight sm:text-5xl">{post.title}</h1>
            <p className="mt-3 text-base text-white/80 sm:mt-4 sm:text-lg">{post.excerpt}</p>
          </div>
        </header>
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-10 text-[15px] leading-relaxed text-[#d9d5ea] sm:py-12 sm:text-base">
          <NewsBody body={post.body} />
          <div className="pt-6">
            <Link href={loggedIn ? "/dashboard" : localPath("/register", lang)} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
              {loggedIn ? t.makePredictions : t.join}
            </Link>
          </div>
        </div>
      </article>
      <SiteFooter />
    </div>
  );
}
