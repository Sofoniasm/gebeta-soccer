import { RegisterForm } from "../AuthForms";
import { pageMeta } from "@/lib/seo";
import { getLang } from "@/lib/i18n-server";
import { PAGES } from "@/lib/i18n/pages";
import { cookies } from "next/headers";
import { Banner } from "@/components/ui";
import { telegramBotId, telegramEnabled } from "@/lib/telegram";
import { PENDING_COOKIE, readPending } from "@/lib/telegram-login";
import { TelegramLoginButton } from "@/components/TelegramLoginButton";
import { OrDivider } from "@/components/OrDivider";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PAGES[lang].auth.registerMeta, description: PAGES[lang].auth.registerDescription, path: "/register", lang, translated: true });
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const lang = await getLang();
  const t = PAGES[lang].auth;
  // Came back from "Log in with Telegram" as a new player?
  const tg = readPending((await cookies()).get(PENDING_COOKIE)?.value, process.env.TELEGRAM_BOT_TOKEN ?? "");
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t.registerTitle}</h1>
        <p className="mt-1 text-sm text-mist">
          {safe?.startsWith("/leagues/") ? t.registerSubLeague : safe?.startsWith("/challenges/") ? t.registerSubChallenge : t.registerSub}
        </p>
      </div>
      {tg ? (
        <Banner kind="success">{t.tgConnected(tg.first_name ?? "")}</Banner>
      ) : (
        telegramEnabled() && (
          <>
            <p className="text-center text-xs text-mist">{t.tgSignupHint}</p>
            <TelegramLoginButton botId={telegramBotId()} next={safe} label={t.tgSignup} failedText={t.tgFailed} />
            <OrDivider label={t.tgOr} />
          </>
        )
      )}
      <RegisterForm next={safe} lang={lang} />
    </div>
  );
}
