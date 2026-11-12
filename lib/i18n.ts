/**
 * English / Amharic. Amharic pages live under /am (e.g. /am/how-to-play);
 * the proxy rewrites them to the normal page and sets the x-gs-lang header,
 * so every page exists once and just picks its words by language.
 */
export type Lang = "en" | "am";
export const LANG_HEADER = "x-gs-lang";

/** Public pages that have an Amharic version. */
const TRANSLATED = ["/", "/how-to-play", "/terms", "/predictions", "/news", "/apps", "/about", "/business", "/tournaments", "/login", "/register", "/forgot", "/reset"];

export function isTranslatable(path: string): boolean {
  return TRANSLATED.includes(path) || path.startsWith("/predictions/") || path.startsWith("/news/");
}

/** "/am/how-to-play" -> "/how-to-play" */
export function stripLang(path: string): string {
  if (path === "/am") return "/";
  if (path.startsWith("/am/")) return path.slice(3);
  return path;
}

/** Link to a page in the given language (falls back to English for pages without a translation). */
export function localPath(path: string, lang: Lang): string {
  if (lang !== "am" || !isTranslatable(path)) return path;
  return path === "/" ? "/am" : `/am${path}`;
}

export const LOCALE: Record<Lang, string> = { en: "en-GB", am: "am-ET" };

/** Cookie that remembers the visitor's language choice (set by the EN | አማ switch). */
export const LANG_COOKIE = "gs_lang";
export function rememberLang(lang: Lang) {
  if (typeof document !== "undefined") document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
