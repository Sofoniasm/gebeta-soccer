import Link from "next/link";
import { getPublicContext } from "@/lib/public";
import { TELEGRAM_URL } from "@/lib/config";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { PageHero } from "@/components/PageHero";
import { PhoneMockup } from "@/components/PhoneMockup";
import { SendIcon } from "@/components/icons";
import { SITE_HOST } from "@/lib/site";
import { pageMeta } from "@/lib/seo";

export const metadata = pageMeta({
  title: "Get the app — Android, iPhone & Telegram",
  description: "Install GebetaSoccer on Android or iPhone in seconds, or play inside Telegram with our Mini App. Same account everywhere.",
  path: "/apps",
});

const ANDROID = [`Open ${SITE_HOST} in Chrome`, "Tap the ⋮ menu (top right)", "Tap “Add to Home screen” → Install", "Open GebetaSoccer from your home screen"];
const IPHONE = [`Open ${SITE_HOST} in Safari`, "Tap the Share button (square with arrow)", "Scroll down and tap “Add to Home Screen”", "Tap “Add” — the icon appears on your home screen"];

function Steps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <div className="rounded-[2rem] border border-white/5 bg-card/60 p-6">
      <p className="text-lg font-extrabold">{title}</p>
      <ol className="mt-4 space-y-3">
        {steps.map((s, i) => (
          <li key={s} className="flex gap-3 text-sm text-mist">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-lilac text-xs font-extrabold text-ink">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}

export default async function AppsPage() {
  const { loggedIn } = await getPublicContext();
  return (
    <div className="relative">
      <SiteHeader loggedIn={loggedIn} />
      <PageHero title="Get the app" subtitle="GebetaSoccer installs straight from your browser — no app store needed, light on data, always up to date." />

      <main className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 lg:grid-cols-[1fr_auto]">
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Steps title="Android (Chrome)" steps={ANDROID} />
            <Steps title="iPhone (Safari)" steps={IPHONE} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-lilac/25 bg-gradient-to-r from-lilac/15 to-transparent p-6">
            <div>
              <p className="text-lg font-extrabold">Join us on Telegram</p>
              <p className="text-sm text-mist">Deposits, help and round announcements — all in one chat.</p>
            </div>
            <a href={TELEGRAM_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full bg-lilac px-6 py-3 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
              <SendIcon size={14} /> Open Telegram
            </a>
          </div>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link href={loggedIn ? "/dashboard" : "/register"} className="inline-flex rounded-full bg-lilac px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-ink hover:bg-lilac-soft">
              {loggedIn ? "Open my predictions" : "Play on the web"}
            </Link>
          </div>
        </div>
        <div className="relative mx-auto hidden w-80 lg:block">
          <div className="absolute inset-0 rotate-3 rounded-[3.5rem] bg-gradient-to-br from-lilac/70 to-[#5b4f96]/60" />
          <div className="relative flex justify-center rounded-[3.5rem] border border-white/10 bg-gradient-to-br from-[#9d8fe6] to-[#5f539c] px-6 py-10">
            <PhoneMockup className="animate-float" />
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
