// Browser-side helpers for the Telegram Mini App (no secrets here).

export interface TelegramWebApp {
  initData: string;
  initDataUnsafe?: { user?: { id: number; first_name?: string } };
  colorScheme?: "light" | "dark";
  ready(): void;
  expand(): void;
  close(): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  openTelegramLink?(url: string): void;
  BackButton?: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { notificationOccurred(type: "success" | "error" | "warning"): void };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

/** The Telegram WebApp object when we're running inside Telegram, else null. */
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === "undefined") return null;
  const wa = window.Telegram?.WebApp;
  return wa && wa.initData ? wa : null;
}

/** Wait (briefly) for telegram-web-app.js to load. */
export async function waitForWebApp(timeoutMs = 2500): Promise<TelegramWebApp | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const wa = getWebApp();
    if (wa) return wa;
    if (typeof window !== "undefined" && window.Telegram?.WebApp && !window.Telegram.WebApp.initData) return null; // loaded, but not in Telegram
    await new Promise((r) => setTimeout(r, 100));
  }
  return getWebApp();
}
