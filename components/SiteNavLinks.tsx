"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { localPath, stripLang, type Lang } from "@/lib/i18n";
import { COMMON, SITE_LINK_KEYS } from "@/lib/i18n/common";

/** Desktop nav with an underline on the current page (like Superbru). */
export function SiteNavLinks({ lang = "en" }: { lang?: Lang }) {
  const path = stripLang(usePathname() || "/");
  return (
    <div className="hidden items-stretch gap-1 lg:flex">
      {SITE_LINK_KEYS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={localPath(l.href, lang)}
            className={`relative px-3 py-2 text-xs font-bold uppercase tracking-widest transition xl:px-4 ${active ? "text-white" : "text-mist hover:text-white"}`}
          >
            {COMMON[lang].nav[l.key]}
            <span className={`absolute inset-x-3 -bottom-[17px] h-[3px] rounded-full bg-lilac transition xl:inset-x-4 ${active ? "opacity-100" : "opacity-0"}`} />
          </Link>
        );
      })}
    </div>
  );
}
