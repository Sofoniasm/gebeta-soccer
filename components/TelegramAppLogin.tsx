"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SendIcon, SpinnerIcon } from "@/components/icons";

const TEXT = {
  en: {
    button: "Open Telegram app to log in",
    hint: "One tap: Telegram opens, you tap the number shown here, and this page logs you in. No password.",
    waitTitle: "Now in Telegram, tap this number:",
    waitBody: "We sent you a message from our bot. Tap the same number there. This page logs you in by itself.",
    again: "Open Telegram again",
    fallback: "Telegram did not show the numbers? Open @GebetaSoccerbot and send this message:",
    copy: "Copy",
    copied: "Copied",
    cancel: "Cancel",
    expired: "That took too long. Tap the button to start again.",
    denied: "Wrong number in Telegram, so the login was cancelled. Tap the button to start again.",
    failed: "Could not start the Telegram login. Try again, or use your phone number and password below.",
  },
  am: {
    button: "ለመግባት የቴሌግራም መተግበሪያን ክፈት",
    hint: "አንድ ንክኪ፦ ቴሌግራም ይከፈታል፣ እዚህ የሚታየውን ቁጥር ይጫኑ፣ ገጹ በራሱ ያስገባዎታል። የይለፍ ቃል አያስፈልግም።",
    waitTitle: "አሁን በቴሌግራም ይህን ቁጥር ይጫኑ፦",
    waitBody: "ከቦታችን መልዕክት ልከንልዎታል። እዚያ ተመሳሳዩን ቁጥር ይጫኑ። ገጹ በራሱ ያስገባዎታል።",
    again: "ቴሌግራምን እንደገና ክፈት",
    fallback: "ቴሌግራም ቁጥሮቹን አላሳየም? @GebetaSoccerbot ን ከፍተው ይህን መልዕክት ይላኩ፦",
    copy: "ቅዳ",
    copied: "ተቀድቷል",
    cancel: "ተው",
    expired: "ጊዜው አልፏል። እንደገና ለመጀመር አዝራሩን ይጫኑ።",
    denied: "በቴሌግራም የተሳሳተ ቁጥር ተጫኑ፣ ስለዚህ መግቢያው ተሰርዟል። እንደገና ለመጀመር አዝራሩን ይጫኑ።",
    failed: "የቴሌግራም መግቢያውን መጀመር አልተቻለም። እንደገና ይሞክሩ፣ ወይም ከታች ስልክ ቁጥርና የይለፍ ቃል ይጠቀሙ።",
  },
} as const;

/**
 * "Open Telegram app to log in": works on a phone browser. The button opens the Telegram app (t.me link), the bot asks the
 * player to tap the 2-digit number shown here, and this page polls until the login is approved. No Telegram login popup.
 */
export function TelegramAppLogin({ next, lang = "en" }: { next?: string; lang?: "en" | "am" }) {
  const t = TEXT[lang];
  const router = useRouter();
  const [state, setState] = useState<"idle" | "starting" | "waiting">("idle");
  const [note, setNote] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [link, setLink] = useState("");
  const [short, setShort] = useState("");
  const [copied, setCopied] = useState(false);
  const stop = useRef(false);

  useEffect(() => {
    stop.current = false;
    return () => {
      stop.current = true;
    };
  }, []);

  function poll(started: number) {
    if (stop.current) return;
    if (Date.now() - started > 5 * 60_000) {
      setState("idle");
      return setNote(t.expired);
    }
    fetch("/api/telegram/app-login/status", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ status: string }>)
      .then((d) => {
        if (stop.current) return;
        if (d.status === "ok") {
          router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
          router.refresh();
          return;
        }
        if (d.status === "denied" || d.status === "expired") {
          setState("idle");
          return setNote(d.status === "denied" ? t.denied : t.expired);
        }
        setTimeout(() => poll(started), 2000);
      })
      .catch(() => setTimeout(() => poll(started), 3000));
  }

  async function start() {
    setNote(null);
    setState("starting");
    try {
      const res = await fetch("/api/telegram/app-login/start", { method: "POST" });
      const d = (await res.json()) as { ok: boolean; code?: string; short?: string; link?: string; error?: string };
      if (!d.ok || !d.code || !d.link) {
        setState("idle");
        return setNote(d.error ?? t.failed);
      }
      setCode(d.code);
      setShort(d.short ?? "");
      setLink(d.link);
      setState("waiting");
      poll(Date.now());
      window.location.assign(d.link); // opens the Telegram app on a phone
    } catch {
      setState("idle");
      setNote(t.failed);
    }
  }

  if (state === "waiting") {
    return (
      <div className="space-y-3 rounded-2xl border border-[#2aabee]/40 bg-[#2aabee]/10 p-4 text-center">
        <p className="text-sm font-bold">{t.waitTitle}</p>
        <p className="text-5xl font-extrabold tracking-widest text-white">{code}</p>
        <p className="text-xs text-mist">{t.waitBody}</p>
        <p className="flex items-center justify-center gap-2 text-xs text-mist">
          <SpinnerIcon size={14} />
        </p>
        {short && (
          <div className="rounded-xl bg-ink/50 p-3 text-xs text-mist">
            <p>{t.fallback}</p>
            <p className="mt-2 flex items-center justify-center gap-2">
              <code className="rounded bg-white/10 px-2 py-1 text-sm font-bold text-white">/login {short}</code>
              <button
                type="button"
                className="font-bold text-[#2aabee] underline underline-offset-4"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(`/login ${short}`);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  } catch {
                    /* the text is selectable */
                  }
                }}
              >
                {copied ? t.copied : t.copy}
              </button>
            </p>
          </div>
        )}
        <div className="flex flex-wrap justify-center gap-3 text-sm">
          <a href={link} className="font-bold text-[#2aabee] underline underline-offset-4">
            {t.again}
          </a>
          <button
            type="button"
            className="text-mist underline underline-offset-4"
            onClick={() => {
              stop.current = true;
              setState("idle");
              setTimeout(() => {
                stop.current = false;
              }, 50);
            }}
          >
            {t.cancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={start}
        disabled={state === "starting"}
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-[#2aabee]/25 transition hover:brightness-110 disabled:opacity-60"
      >
        {state === "starting" ? <SpinnerIcon size={18} /> : <SendIcon size={18} />} {t.button}
      </button>
      <p className="text-center text-xs text-mist">{t.hint}</p>
      {note && <p className="text-center text-xs text-rose-200">{note}</p>}
    </div>
  );
}
