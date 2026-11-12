import Link from "next/link";
import { Banner } from "@/components/ui";
import { getLang } from "@/lib/i18n-server";
import { localPath } from "@/lib/i18n";
import { PAGES } from "@/lib/i18n/pages";
import { checkResetToken } from "@/lib/password-reset";
import { ResetForm } from "../ResetForms";

export async function generateMetadata() {
  return { title: `${PAGES[await getLang()].auth.resetTitle} · GebetaSoccer`, robots: { index: false } };
}
export const dynamic = "force-dynamic";

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t: token = "" } = await searchParams;
  const lang = await getLang();
  const t = PAGES[lang].auth;
  const valid = token ? await checkResetToken(token) : null;
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-extrabold">{t.resetTitle}</h1>
      {valid ? (
        <ResetForm token={token} lang={lang} />
      ) : (
        <>
          <Banner kind="error">{t.resetBadLink}</Banner>
          <Link href={localPath("/forgot", lang)} className="block text-center text-sm font-semibold text-lilac">{t.askNew}</Link>
        </>
      )}
    </div>
  );
}
