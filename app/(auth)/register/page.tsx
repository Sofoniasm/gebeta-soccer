import { RegisterForm } from "../AuthForms";
import { pageMeta } from "@/lib/seo";
import { getLang } from "@/lib/i18n-server";
import { PAGES } from "@/lib/i18n/pages";

export async function generateMetadata() {
  const lang = await getLang();
  return pageMeta({ title: PAGES[lang].auth.registerMeta, description: PAGES[lang].auth.registerDescription, path: "/register", lang, translated: true });
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safe = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
  const lang = await getLang();
  const t = PAGES[lang].auth;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold">{t.registerTitle}</h1>
        <p className="mt-1 text-sm text-mist">
          {safe?.startsWith("/leagues/") ? t.registerSubLeague : safe?.startsWith("/challenges/") ? t.registerSubChallenge : t.registerSub}
        </p>
      </div>
      <RegisterForm next={safe} lang={lang} />
    </div>
  );
}
