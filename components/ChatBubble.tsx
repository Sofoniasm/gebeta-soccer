"use client";

import { useState } from "react";
import { HelpChat } from "@/app/help/HelpChat";

/** Floating "Ask" button on every app screen (website and Telegram Mini App). Opens the help assistant. */
export function ChatBubble({ lang = "en" }: { lang?: "en" | "am" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      {open && (
        <div className="fixed inset-x-3 bottom-24 z-50 sm:inset-x-auto sm:bottom-24 sm:right-6 sm:w-[24rem] lg:bottom-6" role="dialog" aria-label="Help assistant">
          <div className="overflow-hidden rounded-[2rem] border border-lilac/30 bg-[#14111f] shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/5 px-5 py-3">
              <p className="text-sm font-extrabold">💬 {lang === "am" ? "ገበጣሶከር እርዳታ" : "GebetaSoccer help"}</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="rounded-full px-2 text-lg text-mist hover:text-white">
                ×
              </button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <HelpChat lang={lang} loggedIn compact />
            </div>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close help" : "Ask for help"}
        className="fixed bottom-24 right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-lilac text-2xl text-ink shadow-xl shadow-lilac/30 transition hover:scale-105 lg:bottom-6 lg:right-6"
        style={open ? { display: "none" } : undefined}
      >
        💬
      </button>
    </>
  );
}
