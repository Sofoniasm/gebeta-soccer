import { getSiteSettings, telegramHandle } from "@/lib/site-settings";
import { COMMON } from "@/lib/i18n/common";
import type { Lang } from "@/lib/i18n";

/** "Join our Telegram community" card linking to the public channel (Admin → Site). */
export async function ChannelBanner({ lang = "en", className = "" }: { lang?: Lang; className?: string }) {
  const site = await getSiteSettings();
  if (!site.telegram_channel) return null;
  const t = COMMON[lang].channel;
  return (
    <a
      href={site.telegram_channel}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-3 rounded-2xl border border-sky-300/25 bg-gradient-to-r from-sky-400/15 to-transparent px-4 py-3 transition hover:border-sky-300/50 ${className}`}
    >
      <span className="text-xl" aria-hidden>📣</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-white">{t.title}</span>
        <span className="block text-xs text-mist">
          {t.text} <b className="text-white">{telegramHandle(site.telegram_channel)}</b>
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold uppercase tracking-wider text-sky-200">{t.button} →</span>
    </a>
  );
}
