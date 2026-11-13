"use client";

import { useEffect, useState } from "react";
import { SendIcon, SpinnerIcon } from "@/components/icons";

type TgAuthData = Record<string, string | number> | false;
type TgLogin = { auth: (opts: { bot_id: string; request_access?: string; lang?: string }, cb: (data: TgAuthData) => void) => void };
/** Telegram's login API, added to window by telegram-widget.js. */
const tgLogin = () => (window as unknown as { Telegram?: { Login?: TgLogin } }).Telegram?.Login;

const SCRIPT = "https://telegram.org/js/telegram-widget.js?22";

/**
 * Our own "Log in with Telegram" button (our colours, our language), using
 * Telegram's official login popup. request_access "write" asks the player to
 * let our bot message them, so the bot can write first (no START needed).
 * Telegram only allows it on the domain set in @BotFather → /setdomain.
 */
export function TelegramLoginButton({ botId, next, label, failedText }: { botId: string; next?: string; label: string; failedText: string }) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (tgLogin()) return setReady(true);
    let s = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    if (!s) {
      s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      document.head.appendChild(s);
    }
    const onLoad = () => setReady(Boolean(tgLogin()));
    s.addEventListener("load", onLoad);
    return () => s?.removeEventListener("load", onLoad);
  }, []);

  function start() {
    const login = tgLogin();
    if (!login || !botId) return setFailed(true);
    setFailed(false);
    setBusy(true);
    login.auth({ bot_id: botId, request_access: "write" }, (data) => {
      if (!data) {
        setBusy(false);
        setFailed(true);
        return;
      }
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(data)) q.set(k, String(v));
      if (next && next !== "/dashboard") q.set("next", next);
      window.location.assign(`/api/telegram/login?${q}`);
    });
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={!ready || busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#2aabee]/25 transition hover:brightness-110 disabled:opacity-60"
      >
        {busy ? <SpinnerIcon size={18} /> : <SendIcon size={18} />} {label}
      </button>
      {failed && <p className="text-center text-xs text-rose-200">{failedText}</p>}
    </div>
  );
}
