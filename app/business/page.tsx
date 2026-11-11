import { getPublicContext } from "@/lib/public";
import { TELEGRAM_URL } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { SendIcon, TrophyIcon, UsersIcon, StarIcon } from "@/components/icons";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "For Businesses: Sponsor a Round",
  description: "Sponsor a GebetaSoccer round, run a company prediction league or add prizes to reach engaged football fans across Ethiopia.",
  path: "/business",
});

const OFFERS = [
  { icon: <TrophyIcon size={28} />, title: "Sponsor a round", body: "Put your brand on a weekly round, its leaderboard and the winner announcement on Telegram." },
  { icon: <UsersIcon size={28} />, title: "Company leagues", body: "A private prediction league for your staff or customers — a fun way to bring people together every weekend." },
  { icon: <StarIcon size={28} />, title: "Prizes & promotions", body: "Add your products or vouchers as extra prizes and reach engaged football fans across Ethiopia." },
];

export default async function BusinessPage() {
  const { loggedIn, stats } = await getPublicContext();
  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title="For businesses" subtitle="Reach football fans every weekend — at the moment they care most." image="/crowd.webp" />
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="grid gap-3 md:grid-cols-3 md:gap-5">
          {OFFERS.map((o) => (
            <div key={o.title} className="flex items-start gap-4 rounded-[1.5rem] border border-white/5 bg-card/60 p-5 md:block md:rounded-[2rem] md:p-8 md:text-center">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lilac to-[#6c5fb3] text-ink md:mx-auto md:h-16 md:w-16">{o.icon}</div>
              <div>
                <p className="text-base font-extrabold md:mt-5 md:text-lg">{o.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-mist md:mt-2">{o.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-6 rounded-[2rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-8">
          <div>
            <p className="text-2xl font-extrabold">Let&apos;s talk</p>
            <p className="mt-1 text-mist">
              {Number(stats.players) > 0 ? `${Number(stats.players).toLocaleString("en-US")} players and growing. ` : ""}
              Tell us what you have in mind and we&apos;ll put together a plan.
            </p>
          </div>
          <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
            <SendIcon size={14} /> Contact us on Telegram
          </a>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
