"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isTranslatable, localPath, stripLang } from "@/lib/i18n";

/** EN | አማ toggle. Pages without an Amharic version switch to the Amharic home page. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const path = usePathname() || "/";
  const base = stripLang(path);
  const isAm = path === "/am" || path.startsWith("/am/");
  const amHref = isTranslatable(base) ? localPath(base, "am") : "/am";
  const item = "rounded-full px-2.5 py-1 text-[11px] font-extrabold transition";
  return (
    <div className={`flex items-center rounded-full border border-white/20 p-0.5 ${className}`} role="group" aria-label="Language">
      <Link href={base} hrefLang="en" aria-current={!isAm ? "true" : undefined} className={`${item} ${!isAm ? "bg-lilac text-ink" : "text-mist hover:text-white"}`}>
        EN
      </Link>
      <Link href={amHref} hrefLang="am" aria-current={isAm ? "true" : undefined} className={`${item} ${isAm ? "bg-lilac text-ink" : "text-mist hover:text-white"}`}>
        አማ
      </Link>
    </div>
  );
}
