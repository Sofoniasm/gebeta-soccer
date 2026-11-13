import { LoginForm } from "../AuthForms";
import { Banner } from "@/components/ui";
import { getLang } from "@/lib/i18n-server";
import { PAGES } from "@/lib/i18n/pages";
import { telegramBotId, telegramEnabled } from "@/lib/telegram";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { OrDivider } from "@/components/OrDivider";

export async function generateMetadata() {
  return { title: `${PAGES[await getLang()].auth.loginMeta} · GebetaSoccer` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; confirmed?: string; reset?: string }>;
}) {
  const { next, error, confirmed, reset } = await searchParams;
  const lang = await getLang();
  const t = PAGES[lang].auth;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t.loginTitle}</h1>
      {confirmed && <Banner kind="success">{t.confirmed}</Banner>}
      {reset && <Banner kind="success">{t.resetDone}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      {telegramEnabled() && (
        <>
          <TelegramLoginButton botId={telegramBotId()} next={next} label={t.tgLogin} failedText={t.tgFailed} />
          <p className="text-center text-xs text-mist">{t.tgLoginHint}</p>
          <OrDivider label={t.tgOr} />
        </>
      )}
      <LoginForm next={next} lang={lang} />
    </div>
  );
}
