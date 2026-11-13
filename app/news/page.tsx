import { PAGES } from "@/lib/i18n/pages";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { formatNewsDate, type NewsPost, localizeNews } from "@/lib/news";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PAGES[lang].news.metaTitle, description: PAGES[lang].news.metaDescription, path: "/news", lang, translated: true });
}
export const dynamic = "force-dynamic";

export default async function NewsPage() {
  const lang = await getLang();
  const t = PAGES[lang].news;
  const { supabase, loggedIn } = await getPublicContext();
  const { data } = await supabase
    .from("news_posts")
    .select("*")
    .order("published_at", { ascending: false })
    .limit(30);
  const posts = ((data ?? []) as NewsPost[]).map((p) => localizeNews(p, lang));
  const [lead, ...rest] = posts;

  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title={t.title} subtitle={t.subtitle} image="/crowd.webp" />

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
        {posts.length === 0 && <p className="text-center text-mist">{t.empty}</p>}

        {lead && (
          <Link href={localPath(`/news/${lead.slug}`, lang)} className="group mb-4 grid overflow-hidden rounded-[1.75rem] sm:mb-8 sm:rounded-[2rem] border border-white/5 bg-card/60 transition hover:border-lilac/40 lg:grid-cols-2">
            <div className="relative h-44 overflow-hidden sm:h-56 lg:h-auto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lead.cover_image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
            </div>
            <div className="p-5 sm:p-8">
              <span className="rounded-full bg-lilac/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-lilac-soft">{lead.tag}</span>
              <h2 className="mt-3 text-xl font-extrabold leading-tight sm:mt-4 sm:text-3xl">{lead.title}</h2>
              <p className="mt-2 line-clamp-3 text-sm text-mist sm:mt-3 sm:text-base">{lead.excerpt}</p>
              <p className="mt-4 text-xs text-mist/70 sm:mt-6">{formatNewsDate(lead.published_at, lang)}</p>
            </div>
          </Link>
        )}

        <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {rest.map((p) => (
            <Link key={p.id} href={localPath(`/news/${p.slug}`, lang)} className="group flex overflow-hidden rounded-[1.5rem] border border-white/5 bg-card/60 transition hover:-translate-y-1 hover:border-lilac/40 sm:block sm:rounded-[2rem]">
              <div className="w-28 shrink-0 overflow-hidden sm:h-44 sm:w-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.cover_image} alt="" loading="lazy" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
              </div>
              <div className="min-w-0 p-4 sm:p-6">
                <span className="text-[10px] font-bold uppercase tracking-widest text-lilac">{p.tag}</span>
                <h3 className="mt-1 line-clamp-2 text-sm font-extrabold leading-snug sm:mt-2 sm:text-lg">{p.title}</h3>
                <p className="mt-2 hidden line-clamp-3 text-sm text-mist sm:block">{p.excerpt}</p>
                <p className="mt-1.5 text-xs text-mist/70 sm:mt-4">{formatNewsDate(p.published_at, lang)}</p>
              </div>
            </Link>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
