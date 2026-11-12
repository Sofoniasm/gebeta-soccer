import { getLang } from "@/lib/i18n-server";
import { PAGES } from "@/lib/i18n/pages";
import { getSiteSettings } from "@/lib/site-settings";
import { ForgotForm } from "../ResetForms";

export async function generateMetadata() {
  return { title: `${PAGES[await getLang()].auth.forgotTitle} · GebetaSoccer`, robots: { index: false } };
}

export default async function ForgotPage() {
  const lang = await getLang();
  const t = PAGES[lang].auth;
  const site = await getSiteSettings();
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t.forgotTitle}</h1>
        <p className="mt-1 text-sm text-mist">{t.forgotIntro}</p>
      </div>
      <ForgotForm lang={lang} supportUrl={site.telegram_support} />
    </div>
  );
}
