import { LoginForm } from "../AuthForms";
import { Banner } from "@/components/ui";
import { getLang } from "@/lib/i18n-server";
import { PAGES } from "@/lib/i18n/pages";
import { TELEGRAM_BOT_USERNAME, telegramBotId, telegramEnabled } from "@/lib/telegram";
import { TelegramWait } from "../TelegramWait";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { TelegramAppLogin } from "@/components/TelegramAppLogin";
import { OrDivider } from "@/components/OrDivider";

export async function generateMetadata() {
  return { title: `${PAGES[await getLang()].auth.loginMeta} · GebetaSoccer` };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; confirmed?: string; reset?: string; tgwait?: string; ref?: string }>;
}) {
  const { next, error, confirmed, reset, tgwait, ref } = await searchParams;
  const lang = await getLang();
  const t = PAGES[lang].auth;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t.loginTitle}</h1>
      {confirmed && <Banner kind="success">{t.confirmed}</Banner>}
      {reset && <Banner kind="success">{t.resetDone}</Banner>}
      {error && <Banner kind="error">{error}</Banner>}
      {tgwait && <TelegramWait next={next} bot={TELEGRAM_BOT_USERNAME} referral={ref} lang={lang} />}
      {telegramEnabled() && (
        <>
          <TelegramAppLogin next={next} lang={lang === "am" ? "am" : "en"} />
          <TelegramLoginButton botId={telegramBotId()} next={next} label={t.tgLogin} failedText={t.tgFailed} />
          <p className="text-center text-xs text-mist">{t.tgLoginHint}</p>
          <OrDivider label={t.tgOr} />
        </>
      )}
      <LoginForm next={next} lang={lang} />
    </div>
  );
}
