"use client";

import { usePathname } from "next/navigation";
import { isTranslatable, localPath, rememberLang, stripLang } from "@/lib/i18n";

/**
 * EN | አማ toggle. Uses a full page load on purpose: /login and /am/login are
 * the same page behind the scenes, so an in-app navigation could reuse the
 * page already on screen and keep the old language.
 */
export function LangSwitch({ className = "" }: { className?: string }) {
  const path = usePathname() || "/";
  const base = stripLang(path);
  const isAm = path === "/am" || path.startsWith("/am/");
  const amHref = isTranslatable(base) ? localPath(base, "am") : "/am";
  const go = (lang: "en" | "am", href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    rememberLang(lang);
    window.location.assign(href + window.location.search);
  };
  const item = "rounded-full px-2.5 py-1 text-[11px] font-extrabold transition";
  return (
    <div className={`flex items-center rounded-full border border-white/20 p-0.5 ${className}`} role="group" aria-label="Language">
      <a href={base} hrefLang="en" onClick={go("en", base)} aria-current={!isAm ? "true" : undefined} className={`${item} ${!isAm ? "bg-lilac text-ink" : "text-mist hover:text-white"}`}>
        EN
      </a>
      <a href={amHref} hrefLang="am" onClick={go("am", amHref)} aria-current={isAm ? "true" : undefined} className={`${item} ${isAm ? "bg-lilac text-ink" : "text-mist hover:text-white"}`}>
        አማ
      </a>
    </div>
  );
}
