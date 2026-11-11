"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SITE_LINKS } from "./MobileMenu";

/** Desktop nav with an underline on the current page (like Superbru). */
export function SiteNavLinks() {
  const path = usePathname();
  return (
    <div className="hidden items-stretch gap-1 lg:flex">
      {SITE_LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative px-4 py-2 text-xs font-bold uppercase tracking-widest transition ${active ? "text-white" : "text-mist hover:text-white"}`}
          >
            {l.label}
            <span className={`absolute inset-x-4 -bottom-[17px] h-[3px] rounded-full bg-lilac transition ${active ? "opacity-100" : "opacity-0"}`} />
          </Link>
        );
      })}
    </div>
  );
}
