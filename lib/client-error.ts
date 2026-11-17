/**
 * Client errors (crashes in a player's browser or the Telegram Mini App) are
 * sent to /api/client-error, which writes them to the server log (Vercel →
 * Logs, search "[client-error]"). Never throws, sends at most 5 per page load.
 */
export interface ClientError {
  message?: string;
  stack?: string;
  digest?: string;
  kind?: string;
}

let sent = 0;

/** Keep reports small and free of anything but the error itself. */
export function cleanReport(e: ClientError, url: string, ua: string): Record<string, string> {
  const cut = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  return {
    message: cut(e.message, 500),
    stack: cut(e.stack, 2000),
    digest: cut(e.digest, 100),
    kind: cut(e.kind, 30),
    url: cut(url.split("#")[0], 300), // the #tgWebAppData part holds Telegram login data: never send it
    ua: cut(ua, 300),
  };
}

export function reportClientError(e: ClientError) {
  try {
    if (typeof window === "undefined" || sent >= 5) return;
    sent += 1;
    const body = JSON.stringify(cleanReport(e, window.location.href, navigator.userAgent));
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-error", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    /* never break the page over a report */
  }
}
