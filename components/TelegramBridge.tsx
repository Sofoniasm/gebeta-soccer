"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { waitForWebApp, type TelegramWebApp } from "@/lib/tma";

const HOME_PATHS = ["/dashboard", "/tma"];

/**
 * When the site runs inside Telegram (Mini App): fill the screen, match our
 * colours, and use Telegram's own Back button. Does nothing in a normal browser.
 */
export function TelegramBridge() {
  const path = usePathname();
  const router = useRouter();
  const [wa, setWa] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    let alive = true;
    waitForWebApp().then((app) => {
      if (!alive || !app) return;
      app.ready();
      app.expand();
      app.setHeaderColor?.("#0b0912");
      app.setBackgroundColor?.("#1b1630");
      document.documentElement.dataset.telegram = "1";
      setWa(app);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const back = wa?.BackButton;
    if (!back) return;
    const onBack = () => router.back();
    if (HOME_PATHS.includes(path)) back.hide();
    else {
      back.show();
      back.onClick(onBack);
    }
    return () => back.offClick(onBack);
  }, [wa, path, router]);

  return null;
}
