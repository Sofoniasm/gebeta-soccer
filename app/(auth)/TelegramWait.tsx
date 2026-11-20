"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SpinnerIcon } from "@/components/icons";

/**
 * After "Log in with Telegram" for a Telegram that isn't linked yet: the bot has just sent
 * "Share my phone number". We wait here and sign the player in by themselves as soon as they tap it
 * (the bot confirms or creates the account; Telegram vouches for the number, so no password).
 */
const TEXT = {
  en: {
    title: "One tap in Telegram",
    body: "We just sent you a message. Open Telegram and tap 📱 Share my phone number. Telegram confirms the number is yours, so you don't need a password. This page signs you in by itself.",
    open: "Open Telegram →",
    late: "That took too long.",
    again: "Tap the Telegram button again to get a fresh message.",
    prefer: "Prefer a password?",
    form: "Use the sign-up form",
  },
  am: {
    title: "በቴሌግራም አንድ ንክኪ",
    body: "መልዕክት ልከንልዎታል። ቴሌግራምን ከፍተው «📱 Share my phone number» ን ይጫኑ። ቴሌግራም ቁጥሩ የእርስዎ መሆኑን ያረጋግጣል፣ ስለዚህ የይለፍ ቃል አያስፈልግም። ይህ ገጽ በራሱ ያስገባዎታል።",
    open: "ቴሌግራምን ክፈት →",
    late: "ጊዜው አልፏል።",
    again: "አዲስ መልዕክት ለማግኘት የቴሌግራም አዝራሩን እንደገና ይጫኑ።",
    prefer: "የይለፍ ቃል ይመርጣሉ?",
    form: "የምዝገባ ቅጹን ይጠቀሙ",
  },
} as const;

export function TelegramWait({ next, bot, referral, lang = "en" }: { next?: string; bot: string; referral?: string; lang?: "en" | "am" }) {
  const t = TEXT[lang];
  const router = useRouter();
  const [state, setState] = useState<"waiting" | "expired">("waiting");

  useEffect(() => {
    let stopped = false;
    const started = Date.now();
    async function tick() {
      if (stopped) return;
      if (Date.now() - started > 5 * 60_000) return setState("expired");
      try {
        const res = await fetch("/api/telegram/login-status", { cache: "no-store" });
        const data = (await res.json()) as { status: string };
        if (data.status === "ok") {
          router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
          router.refresh();
          return;
        }
        if (data.status === "expired") return setState("expired");
      } catch {
        /* try again */
      }
      setTimeout(tick, 2000);
    }
    const t = setTimeout(tick, 1500);
    return () => {
      stopped = true;
      clearTimeout(t);
    };
  }, [router, next]);

  const form = `/register?tg=1${next && next !== "/dashboard" ? `&next=${encodeURIComponent(next)}` : ""}${referral ? `&ref=${encodeURIComponent(referral)}` : ""}`;

  return (
    <div className="space-y-3 rounded-2xl border border-[#2aabee]/40 bg-[#2aabee]/10 p-4 text-sm">
      {state === "waiting" ? (
        <>
          <p className="flex items-center gap-2 font-extrabold text-white"><SpinnerIcon size={16} /> {t.title}</p>
          <p className="text-mist">{t.body}</p>
          {bot && <a href={`https://t.me/${bot}`} className="inline-block font-bold text-lilac hover:text-lilac-soft">{t.open}</a>}
        </>
      ) : (
        <>
          <p className="font-extrabold text-white">{t.late}</p>
          <p className="text-mist">{t.again}</p>
        </>
      )}
      <p className="text-xs text-mist">{t.prefer} <Link href={form} className="font-bold text-lilac">{t.form}</Link>.</p>
    </div>
  );
}
