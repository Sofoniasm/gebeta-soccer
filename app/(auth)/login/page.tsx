import { LoginForm } from "../AuthForms";
import { Banner } from "@/components/ui";
import { getLang } from "@/lib/i18n-server";
import { PAGES } from "@/lib/i18n/pages";

export async function generateMetadata() {
  return { title: `${PAGES[await getLang()].auth.loginMeta} · GebetaSoccer` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; confirmed?: string }>;
}) {
  const { next, error, confirmed } = await searchParams;
  const lang = await getLang();
  const t = PAGES[lang].auth;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t.loginTitle}</h1>
      {confirmed && <Banner kind="success">{t.confirmed}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      <LoginForm next={next} lang={lang} />
    </div>
  );
}
