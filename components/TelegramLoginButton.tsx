"use client";

import { useEffect, useRef } from "react";

/**
 * Telegram's official "Log in with Telegram" button.
 * data-request-access="write" asks the player to let our bot message them,
 * so the bot can write first (no need to press START in the bot).
 * Needs the site's domain set in @BotFather → /setdomain.
 */
export function TelegramLoginButton({ bot, next }: { bot: string; next?: string }) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !bot) return;
    const authUrl = new URL("/api/telegram/login", window.location.origin);
    if (next && next !== "/dashboard") authUrl.searchParams.set("next", next);

    const s = document.createElement("script");
    s.src = "https://telegram.org/js/telegram-widget.js?22";
    s.async = true;
    s.setAttribute("data-telegram-login", bot);
    s.setAttribute("data-size", "large");
    s.setAttribute("data-radius", "20");
    s.setAttribute("data-userpic", "false");
    s.setAttribute("data-request-access", "write");
    s.setAttribute("data-auth-url", authUrl.toString());
    el.replaceChildren(s);
    return () => el.replaceChildren();
  }, [bot, next]);

  return <div ref={box} className="flex min-h-[40px] justify-center" />;
}
