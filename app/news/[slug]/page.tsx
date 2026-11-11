import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicContext } from "@/lib/public";
import { formatNewsDate, type NewsPost } from "@/lib/news";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { JsonLd } from "@/components/JsonLd";
import { BRAND, breadcrumbJsonLd, pageMeta } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

async function loadPost(slug: string): Promise<NewsPost | null> {
  const { supabase } = await getPublicContext();
  const { data } = await supabase
    .from("news_posts")
    .select("id, slug, title, excerpt, body, cover_image, tag, published_at")
    .eq("slug", slug)
    .maybeSingle();
  return (data as NewsPost) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await loadPost(slug);
  if (!post) return { title: "Article not found · GebetaSoccer", robots: { index: false } };
  return pageMeta({
    title: post.title,
    description: post.excerpt,
    path: `/news/${post.slug}`,
    image: post.cover_image,
    type: "article",
    publishedTime: post.published_at,
  });
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { supabase, loggedIn } = await getPublicContext();
  const { data } = await supabase
    .from("news_posts")
    .select("id, slug, title, excerpt, body, cover_image, tag, published_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!data) notFound();
  const post = data as NewsPost;

  return (
    <div className="relative">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: post.title,
          description: post.excerpt,
          image: [`${SITE_URL}${post.cover_image}`],
          datePublished: post.published_at,
          dateModified: post.published_at,
          inLanguage: "en",
          mainEntityOfPage: `${SITE_URL}/news/${post.slug}`,
          author: { "@type": "Organization", name: BRAND, url: SITE_URL },
          publisher: { "@id": `${SITE_URL}/#organization`, "@type": "Organization", name: BRAND, logo: { "@type": "ImageObject", url: `${SITE_URL}/icon-512.png` } },
        }}
      />
      <JsonLd data={breadcrumbJsonLd([{ name: "Home", path: "" }, { name: "News", path: "/news" }, { name: post.title, path: `/news/${post.slug}` }])} />
      <SiteHeader loggedIn={loggedIn} />
      <article>
        <header className="relative isolate overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={post.cover_image} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0912]/80 via-[#1a1530]/70 to-plum" />
          <div className="mx-auto max-w-3xl px-6 pb-14 pt-16 sm:pt-24">
            <Link href="/news" className="text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← All news</Link>
            <p className="mt-6 text-[10px] font-bold uppercase tracking-widest text-lilac-soft">{post.tag} · {formatNewsDate(post.published_at)}</p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight sm:text-5xl">{post.title}</h1>
            <p className="mt-4 text-lg text-white/80">{post.excerpt}</p>
          </div>
        </header>
        <div className="mx-auto max-w-3xl space-y-5 px-6 py-12 text-base leading-relaxed text-[#d9d5ea]">
          {post.body.split(/\n\s*\n/).map((para, i) => (
            <p key={i}>{para.trim()}</p>
          ))}
          <div className="pt-8">
            <Link href={loggedIn ? "/dashboard" : "/register"} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
              {loggedIn ? "Make your predictions" : "Join GebetaSoccer"}
            </Link>
          </div>
        </div>
      </article>
      <SiteFooter />
    </div>
  );
}
