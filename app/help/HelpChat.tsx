"use client";

import { useEffect, useRef, useState } from "react";
import { SendIcon, SpinnerIcon } from "@/components/icons";

type Turn = { role: "user" | "assistant"; content: string };

const SUGGEST = {
  en: ["How do I deposit?", "When does the round lock?", "How are points counted?", "My withdrawal is late"],
  am: ["እንዴት ገንዘብ አስገባለሁ?", "ዙሩ መቼ ይዘጋል?", "ነጥብ እንዴት ይቆጠራል?", "ገንዘብ ማውጣቴ ዘገየ"],
};

/** Help chat with the GebetaSoccer assistant. */
export function HelpChat({ lang = "en", loggedIn, compact = false }: { lang?: "en" | "am"; loggedIn: boolean; compact?: boolean }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [turns, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const history = turns;
    setTurns([...history, { role: "user", content: question }]);
    setText("");
    setBusy(true);
    try {
      const res = await fetch("/api/assistant", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: question, history, lang }) });
      const data = (await res.json()) as { reply?: string; handedOff?: boolean };
      const extra = data.handedOff ? (lang === "am" ? "\n\n🆘 ጥያቄዎ ለሰራተኞቻችን ተልኳል።" : "\n\n🆘 Your question was sent to our team.") : "";
      setTurns((t) => [...t, { role: "assistant", content: (data.reply ?? "…") + extra }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", content: lang === "am" ? "ግንኙነቱ ተቋርጧል። እንደገና ይሞክሩ።" : "Connection lost. Please try again." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "flex min-h-[22rem] flex-col" : "flex min-h-[28rem] flex-col rounded-[2rem] border border-white/5 bg-card/60"}>
      <div className="flex-1 space-y-3 overflow-y-auto p-5">
        {turns.length === 0 && (
          <div className="text-sm text-mist">
            <p className="font-bold text-white">{lang === "am" ? "👋 ሰላም! ስለ ገበጣሶከር ማንኛውንም ይጠይቁ።" : "👋 Hi! Ask anything about using GebetaSoccer."}</p>
            <p className="mt-1">
              {lang === "am"
                ? "ስለ ዙሮች፣ ነጥቦች፣ ዋሌት፣ ፕሪሚየም እና መለያዎ መመለስ እችላለሁ። የውርርድ ምክር አልሰጥም።"
                : "Rounds, points, your wallet, Premium, your account. I don't give betting tips."}
              {!loggedIn && (lang === "am" ? " ስለ መለያዎ ለመጠየቅ መጀመሪያ ይግቡ።" : " Log in first for questions about your own account.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGEST[lang].map((s) => (
                <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:border-lilac">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} className={`flex ${t.role === "user" ? "justify-end" : "justify-start"}`}>
            <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${t.role === "user" ? "bg-lilac text-ink" : "bg-ink/60 text-white"}`}>{t.content}</p>
          </div>
        ))}
        {busy && (
          <p className="flex items-center gap-2 text-xs text-mist">
            <SpinnerIcon size={14} /> {lang === "am" ? "እየጻፈ ነው…" : "Typing…"}
          </p>
        )}
        <div ref={end} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex gap-2 border-t border-white/5 p-3"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={1500}
          placeholder={lang === "am" ? "ጥያቄዎን ይጻፉ…" : "Type your question…"}
          className="min-w-0 flex-1 rounded-full border border-white/10 bg-ink/70 px-4 py-2.5 text-sm outline-none focus:border-lilac"
        />
        <button type="submit" disabled={busy || !text.trim()} aria-label="Send" className="rounded-full bg-lilac px-4 text-ink disabled:opacity-40">
          <SendIcon size={18} />
        </button>
      </form>
    </div>
  );
}
