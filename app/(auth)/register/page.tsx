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
import { REF_COOKIE, normalizeReferralCode } from "@/lib/referrals";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PAGES[lang].auth.registerMeta, description: PAGES[lang].auth.registerDescription, path: "/register", lang, translated: true });
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string; ref?: string }> }) {
  const { next, ref: refParam } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  // Already signed in: an invite link cannot give this account a referrer, so do not show the sign-up form again.
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (user) redirect(safe ?? "/dashboard");
  const lang = await getLang();
  const t = PAGES[lang].auth;
  // Came back from "Log in with Telegram" as a new player?
  const jar = await cookies();
  const tg = readPending(jar.get(PENDING_COOKIE)?.value, process.env.TELEGRAM_BOT_TOKEN ?? "");
  // Invite link code (?ref=LAKI10), kept in a cookie through the Telegram sign-up too.
  const ref = normalizeReferralCode(refParam) ?? normalizeReferralCode(jar.get(REF_COOKIE)?.value) ?? undefined;
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
            <TelegramLoginButton botId={telegramBotId()} next={safe} referral={ref} label={t.tgSignup} failedText={t.tgFailed} />
            <OrDivider label={t.tgOr} />
          </>
        )
      )}
      <RegisterForm next={safe} lang={lang} referral={ref} />
    </div>
  );
}
