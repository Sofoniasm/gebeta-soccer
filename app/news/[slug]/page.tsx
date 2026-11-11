import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicContext } from "@/lib/public";
import { formatNewsDate, type NewsPost } from "@/lib/news";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const dynamic = "force-dynamic";

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
