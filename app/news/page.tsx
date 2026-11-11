import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { formatNewsDate, type NewsPost } from "@/lib/news";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "News & guides",
  description: "GebetaSoccer news, round announcements and guides to football score prediction, scoring and payments in Ethiopia.",
  path: "/news",
});
export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const { supabase, loggedIn } = await getPublicContext();
  const { data } = await supabase
    .from("news_posts")
    .select("id, slug, title, excerpt, body, cover_image, tag, published_at")
    .order("published_at", { ascending: false })
    .limit(30);
  const posts = (data ?? []) as NewsPost[];
  const [lead, ...rest] = posts;

  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title="GebetaSoccer News" subtitle="Announcements, guides and stories from the game." image="/crowd.webp" />

      <main className="mx-auto max-w-6xl px-6 py-16">
        {posts.length === 0 && <p className="text-center text-mist">No news yet — check back soon.</p>}

        {lead && (
          <Link href={`/news/${lead.slug}`} className="group mb-8 grid overflow-hidden rounded-[2rem] border border-white/5 bg-card/60 transition hover:border-lilac/40 lg:grid-cols-2">
            <div className="relative h-56 overflow-hidden lg:h-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lead.cover_image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="p-8">
              <span className="rounded-full bg-lilac/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-lilac-soft">{lead.tag}</span>
              <h2 className="mt-4 text-2xl font-extrabold leading-tight sm:text-3xl">{lead.title}</h2>
              <p className="mt-3 text-mist">{lead.excerpt}</p>
              <p className="mt-6 text-xs text-mist/70">{formatNewsDate(lead.published_at)}</p>
            </div>
          </Link>
        )}

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((p) => (
            <Link key={p.id} href={`/news/${p.slug}`} className="group overflow-hidden rounded-[2rem] border border-white/5 bg-card/60 transition hover:-translate-y-1 hover:border-lilac/40">
              <div className="h-44 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.cover_image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              </div>
              <div className="p-6">
                <span className="text-[10px] font-bold uppercase tracking-widest text-lilac">{p.tag}</span>
                <h3 className="mt-2 text-lg font-extrabold leading-snug">{p.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-mist">{p.excerpt}</p>
                <p className="mt-4 text-xs text-mist/70">{formatNewsDate(p.published_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
