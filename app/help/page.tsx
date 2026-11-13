import Link from "next/link";
import { getAuthUser } from "@/lib/auth-user";
import { getLang } from "@/lib/i18n-server";
import { getSiteSettings } from "@/lib/site-settings";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { HelpChat } from "./HelpChat";

export const metadata = { title: "Help · GebetaSoccer", description: "Ask the GebetaSoccer help assistant about rounds, points, your wallet, Premium and your account." };
export const dynamic = "force-dynamic";

export default async function HelpPage() {
  const [user, lang, site] = await Promise.all([getAuthUser(), getLang(), getSiteSettings()]);
  const am = lang === "am";
  return (
    <div className="relative">
      <SiteHeader loggedIn={!!user} />
      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-extrabold tracking-tight">{am ? "እርዳታ" : "Help"}</h1>
        <p className="mb-6 mt-2 text-sm text-mist">
          {am ? "ረዳታችን በሰከንዶች ይመልሳል። ገንዘብ ወይም የመለያ ችግር ከሆነ ለሰራተኞቻችን ያስተላልፋል።" : "Our assistant answers in seconds. For money or account problems it passes your question to our team."}{" "}
          {am ? "ሰው ይፈልጋሉ?" : "Prefer a person?"}{" "}
          <a href={site.telegram_support} target="_blank" rel="noopener noreferrer" className="font-semibold text-lilac">
            {am ? "በቴሌግራም ያግኙን" : "Message us on Telegram"}
          </a>
          . {am ? "ደንቦቹ፦" : "Rules:"} <Link href="/how-to-play" className="font-semibold text-lilac">{am ? "እንዴት እንደሚጫወቱ" : "How to play"}</Link>.
        </p>
        <HelpChat lang={am ? "am" : "en"} loggedIn={!!user} />
      </main>
      <SiteFooter />
    </div>
  );
}
