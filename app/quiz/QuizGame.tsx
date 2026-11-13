"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { answerQuestion, nextQuestion, type AnswerResult } from "./actions";
import type { PublicQuestion } from "@/lib/quiz";

const T = {
  en: {
    start: "Start quiz", resume: "Continue", rules: "5 questions · 20 seconds each · 1 point per right answer",
    q: "Question", of: "of", right: "Correct! +1", wrong: "Not this time", late: "Time's up", answer: "Right answer:",
    next: "Next question", finish: "See my score", score: "Score",
  },
  am: {
    start: "ጨዋታውን ጀምር", resume: "ቀጥል", rules: "5 ጥያቄዎች · እያንዳንዱ 20 ሰከንድ · ለትክክለኛ መልስ 1 ነጥብ",
    q: "ጥያቄ", of: "ከ", right: "ትክክል! +1", wrong: "አልተሳካም", late: "ጊዜው አልቋል", answer: "ትክክለኛው መልስ፦",
    next: "ቀጣይ ጥያቄ", finish: "ውጤቴን አሳይ", score: "ነጥብ",
  },
};

type Feedback = Extract<AnswerResult, { kind: "answer" }> & { choice: number | null };

export function QuizGame({ lang, started, total }: { lang: "en" | "am"; started: boolean; total: number }) {
  const t = T[lang];
  const am = lang === "am";
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState<PublicQuestion | null>(null);
  const [left, setLeft] = useState(0);
  const [fb, setFb] = useState<Feedback | null>(null);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const deadline = useRef(0);
  const sent = useRef(false);

  function load() {
    setError(null);
    setFb(null);
    start(async () => {
      const r = await nextQuestion(am);
      if (r.kind === "error") return setError(r.message);
      if (r.kind === "done") return router.refresh();
      sent.current = false;
      setQ(r.q);
      setScore(r.score);
      setAnswered(r.answered);
      deadline.current = Date.now() + r.q.seconds * 1000;
      setLeft(r.q.seconds);
    });
  }

  function choose(choice: number | null) {
    if (!q || sent.current) return;
    sent.current = true;
    start(async () => {
      const r = await answerQuestion(q.id, choice, am);
      if (r.kind === "error") return setError(r.message);
      setFb({ ...r, choice });
      setScore(r.score);
      setAnswered(r.answered);
    });
  }

  // Countdown; at zero the question is sent as unanswered.
  useEffect(() => {
    if (!q || fb) return;
    const id = setInterval(() => {
      const s = Math.max(0, Math.ceil((deadline.current - Date.now()) / 1000));
      setLeft(s);
      if (s === 0) choose(null);
    }, 250);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, fb]);

  if (!q) {
    return (
      <div className="text-center">
        <p className="mb-5 text-sm text-mist">{t.rules}</p>
        <button onClick={load} disabled={pending} className="w-full rounded-full bg-lilac px-8 py-5 text-lg font-extrabold uppercase tracking-wider text-ink shadow-lg shadow-lilac/30 transition active:scale-95 disabled:opacity-60 sm:w-auto">
          {pending ? "…" : started ? t.resume : `⚡ ${t.start}`}
        </button>
        {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
      </div>
    );
  }

  const pct = Math.max(0, Math.min(100, (left / 20) * 100));
  const last = (fb?.answered ?? answered) >= total;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between text-xs font-bold uppercase tracking-widest text-mist">
        <span>{t.q} {q.position} {t.of} {total}</span>
        <span>{t.score}: <b className="text-white">{score}</b></span>
      </div>
      <div className="mb-5 h-2 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full transition-all duration-300 ${left <= 5 ? "bg-rose-400" : "bg-lilac"}`} style={{ width: `${fb ? 0 : pct}%` }} />
      </div>
      {q.topic && <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-lilac-soft">{q.topic}</p>}
      <h2 className="mb-5 text-xl font-extrabold leading-snug sm:text-2xl">{q.question}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {q.options.map((o, i) => {
          let cls = "border-white/15 bg-white/5 hover:border-lilac hover:bg-lilac/15";
          if (fb) {
            if (i === fb.correct) cls = "border-emerald-300 bg-emerald-400/20 text-white";
            else if (i === fb.choice) cls = "border-rose-300 bg-rose-400/20 text-white";
            else cls = "border-white/10 bg-white/5 opacity-50";
          }
          return (
            <button key={i} disabled={!!fb || pending} onClick={() => choose(i)} className={`min-h-16 rounded-2xl border-2 px-4 py-4 text-left text-base font-bold transition active:scale-[0.98] ${cls}`}>
              <span className="mr-2 text-mist">{"ABCD"[i]}</span>{o}
            </button>
          );
        })}
      </div>
      {!fb && <p className={`mt-4 text-center text-3xl font-extrabold tabular-nums ${left <= 5 ? "text-rose-300" : "text-white"}`}>{left}</p>}
      {fb && (
        <div className={`mt-5 rounded-2xl border p-4 ${fb.isCorrect ? "border-emerald-300/40 bg-emerald-400/10" : "border-rose-300/40 bg-rose-400/10"}`}>
          <p className="text-lg font-extrabold">{fb.isCorrect ? `✅ ${t.right}` : fb.inTime && fb.choice !== null ? `❌ ${t.wrong}` : `⏱️ ${t.late}`}</p>
          {!fb.isCorrect && <p className="mt-1 text-sm">{t.answer} <b>{q.options[fb.correct]}</b></p>}
          {fb.explanation && <p className="mt-2 text-sm text-mist">{fb.explanation}</p>}
          <button onClick={load} disabled={pending} className="mt-4 w-full rounded-full bg-lilac px-6 py-4 text-sm font-extrabold uppercase tracking-wider text-ink active:scale-95 disabled:opacity-60">
            {pending ? "…" : last ? t.finish : `${t.next} →`}
          </button>
        </div>
      )}
      {error && <p className="mt-4 text-sm text-rose-300">{error}</p>}
    </div>
  );
}
