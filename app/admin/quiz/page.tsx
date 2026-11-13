import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Banner, inputClass } from "@/components/ui";
import { eatDate } from "@/lib/round-slots";
import type { QuizQuestionRow } from "@/lib/quiz";
import { SubmitButton } from "../SubmitButton";
import { deleteQuiz, generateQuiz, saveQuiz, setQuizStatus } from "./actions";

export const metadata = { title: "Quiz · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI generation can take 10-30 seconds

type Day = { id: number; quiz_date: string; status: "draft" | "published" };

export default async function AdminQuizPage({ searchParams }: { searchParams: Promise<{ date?: string; msg?: string; err?: string }> }) {
  await requireAdminId("/admin/quiz");
  const sp = await searchParams;
  const admin = createAdminClient();
  const today = eatDate();
  const { data: daysData } = await admin.from("quiz_days").select("id, quiz_date, status").gte("quiz_date", eatDate(new Date(), -7)).order("quiz_date");
  const days = (daysData ?? []) as Day[];
  const todayLive = days.some((d) => d.quiz_date === today && d.status === "published");
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : todayLive ? eatDate(new Date(), 1) : today;
  const day = days.find((d) => d.quiz_date === date) ?? (await admin.from("quiz_days").select("id, quiz_date, status").eq("quiz_date", date).maybeSingle()).data as Day | null;
  const [{ data: qData }, { data: answerRows }] = day
    ? await Promise.all([
        admin.from("quiz_questions").select("*").eq("quiz_id", day.id).order("position"),
        admin.from("quiz_answers").select("user_id").eq("quiz_id", day.id).limit(5000),
      ])
    : [{ data: [] }, { data: [] }];
  const players = new Set(((answerRows ?? []) as { user_id: string }[]).map((r) => r.user_id)).size;
  const qs = (qData ?? []) as QuizQuestionRow[];
  const locked = players > 0;
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";
  const label = "mb-1 block text-[11px] font-bold uppercase tracking-widest text-mist";
  const nextDays = [0, 1, 2, 3, 4, 5, 6].map((n) => eatDate(new Date(), n));

  return (
    <AppShell title="Quiz" next="/admin/quiz">
      {sp.msg && <div className="mb-4"><Banner kind="success">{sp.msg}</Banner></div>}
      {sp.err && <div className="mb-4"><Banner kind="error">{sp.err}</Banner></div>}

      <section className={`${card} mb-5`}>
        <p className="mb-3 text-sm text-mist">One quiz per day (Addis Ababa date), 5 questions, free to play. It goes live at midnight of its date once published. Players see it at <Link href="/quiz" className="text-lilac">/quiz</Link>.</p>
        <div className="flex flex-wrap gap-2">
          {nextDays.map((d) => {
            const s = days.find((x) => x.quiz_date === d)?.status;
            return (
              <Link key={d} href={`/admin/quiz?date=${d}`} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${d === date ? "border-lilac bg-lilac/20 text-white" : "border-white/10 text-mist"}`}>
                {d === today ? "Today" : new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}{" "}
                {s === "published" ? "✅" : s === "draft" ? "📝" : "·"}
              </Link>
            );
          })}
        </div>
      </section>

      <section className={card}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">
            {date} {day ? (day.status === "published" ? <span className="text-emerald-300">· Live</span> : <span className="text-amber-200">· Draft</span>) : <span className="text-mist">· No quiz yet</span>}
            {players > 0 && <span className="ml-2 text-sm text-mist">({players} played)</span>}
          </h2>
          {!locked && day?.status !== "published" && (
            <form action={generateQuiz}>
              <input type="hidden" name="date" value={date} />
              <SubmitButton className="rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">✨ {day ? "Regenerate with AI" : "Generate daily quiz"}</SubmitButton>
            </form>
          )}
        </div>
        {locked && <p className="mb-4 rounded-2xl bg-white/5 p-3 text-xs text-mist">Players have answered this quiz, so it is locked to keep scores fair.</p>}
        {day && !locked && <p className="mb-4 rounded-2xl border border-amber-200/30 bg-amber-300/10 p-3 text-xs text-amber-100">AI can get facts wrong. Check each right answer (✔) before publishing, especially the Ethiopian football question.</p>}

        {(day || !locked) && (
          <form action={saveQuiz} className="space-y-6">
            <input type="hidden" name="date" value={date} />
            {[1, 2, 3, 4, 5].map((i) => {
              const q = qs.find((x) => x.position === i);
              return (
                <fieldset key={i} disabled={locked} className="rounded-2xl border border-white/10 bg-ink/40 p-4">
                  <div className="mb-3 grid gap-3 sm:grid-cols-[8rem_1fr]">
                    <div>
                      <label className={label}>#{i} Topic</label>
                      <input name={`q${i}_topic`} defaultValue={q?.topic} className={inputClass} />
                    </div>
                    <div>
                      <label className={label}>Question</label>
                      <input name={`q${i}_question`} required defaultValue={q?.question} className={inputClass} />
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[0, 1, 2, 3].map((j) => (
                      <label key={j} className="flex items-center gap-2">
                        <input type="radio" name={`q${i}_correct`} value={j} required defaultChecked={q?.correct === j} className="h-4 w-4 accent-emerald-400" title="Right answer" />
                        <input name={`q${i}_o${j}`} required defaultValue={q?.options[j]} placeholder={`Answer ${"ABCD"[j]}`} className={`${inputClass} py-2`} />
                      </label>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-mist/70">Tick the circle next to the right answer.</p>
                  <div className="mt-3">
                    <label className={label}>Explanation (shown after answering)</label>
                    <input name={`q${i}_explanation`} defaultValue={q?.explanation} className={inputClass} />
                  </div>
                  <details className="mt-3" open={Boolean(q?.question_am)}>
                    <summary className="cursor-pointer text-xs font-bold text-mist">አማርኛ</summary>
                    <div className="mt-2 space-y-2">
                      <input name={`q${i}_question_am`} defaultValue={q?.question_am} placeholder="ጥያቄ" className={inputClass} />
                      <div className="grid gap-2 sm:grid-cols-2">
                        {[0, 1, 2, 3].map((j) => (
                          <input key={j} name={`q${i}_oam${j}`} defaultValue={q?.options_am?.[j] ?? ""} placeholder={`መልስ ${"ABCD"[j]} (same order)`} className={`${inputClass} py-2`} />
                        ))}
                      </div>
                      <input name={`q${i}_explanation_am`} defaultValue={q?.explanation_am} placeholder="ማብራሪያ" className={inputClass} />
                    </div>
                  </details>
                </fieldset>
              );
            })}
            {!locked && <SubmitButton className="w-full rounded-full border border-white/40 px-6 py-3 text-sm font-bold uppercase tracking-wider">Save</SubmitButton>}
          </form>
        )}

        {day && (
          <div className="mt-5 flex flex-wrap gap-3 border-t border-white/5 pt-5">
            {day.status === "draft" ? (
              <form action={setQuizStatus}>
                <input type="hidden" name="date" value={date} />
                <input type="hidden" name="publish" value="1" />
                <SubmitButton className="rounded-full bg-emerald-400 px-6 py-3 text-sm font-bold uppercase tracking-wider text-ink">Publish</SubmitButton>
              </form>
            ) : (
              !locked && (
                <form action={setQuizStatus}>
                  <input type="hidden" name="date" value={date} />
                  <SubmitButton className="rounded-full border border-white/30 px-6 py-3 text-sm font-bold uppercase tracking-wider">Unpublish</SubmitButton>
                </form>
              )
            )}
            {!locked && (
              <form action={deleteQuiz}>
                <input type="hidden" name="date" value={date} />
                <SubmitButton className="rounded-full border border-rose-300/40 px-6 py-3 text-sm font-bold uppercase tracking-wider text-rose-200">Delete</SubmitButton>
              </form>
            )}
          </div>
        )}
      </section>
    </AppShell>
  );
}
