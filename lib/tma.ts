// Browser-side helpers for the Telegram Mini App (no secrets here).

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  colorScheme?: "light" | "dark";
  ready(): void;
  expand(): void;
  disableVerticalSwipes?(): void;
  close(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openTelegramLink?(url: string): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
  /** Asks the player to share their phone number with the bot (one tap). */
  requestContact?(callback?: (shared: boolean) => void): void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/**
 * Mini App direct links (t.me/<bot>/<app>?startapp=r_5) put "start_param" in Telegram's signed data.
 *   r_<round id>  → that round, scrolled to a new slip with its games
 *   c_GC-XXXXXX   → that challenge
 * Anything else is ignored (it is user-controlled text).
 */
export function startParamNext(initData: string | null | undefined): string | null {
  if (!initData) return null;
  let sp: string | null = null;
  try {
    sp = new URLSearchParams(initData).get("start_param");
  } catch {
    return null;
  }
  if (!sp) return null;
  const round = /^r_(\d{1,9})$/.exec(sp);
  if (round) return `/dashboard?round=${round[1]}&new=1#slip`;
  const ch = /^c_(GC-[A-Z0-9]{6})$/.exec(sp);
  if (ch) return `/challenges/${ch[1]}`;
  return null;
}

/** The Telegram WebApp object when we're running inside Telegram, else null. */
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const wa = window.Telegram?.WebApp;
  return wa && wa.initData ? wa : null;
}

/**
 * Telegram also puts the signed initData in the page address
 * (#tgWebAppData=...), so we can sign in even when telegram-web-app.js is
 * slow to load on a weak connection.
 */
export function initDataFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const fromHash = hash.get("tgWebAppData");
    if (fromHash) return fromHash;
    const fromQuery = new URLSearchParams(window.location.search).get("tgWebAppData");
    return fromQuery || null;
  } catch {
    return null;
  }
}

/** Wait for telegram-web-app.js (up to 8 s: slow mobile networks). */
export async function waitForWebApp(timeoutMs = 8000): Promise<TelegramWebApp | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const wa = getWebApp();
    if (wa) return wa;
    if (typeof window !== "undefined" && window.Telegram?.WebApp && !window.Telegram.WebApp.initData && !initDataFromUrl()) return null; // loaded, but not in Telegram
    await new Promise((r) => setTimeout(r, 100));
  }
  return getWebApp();
}
