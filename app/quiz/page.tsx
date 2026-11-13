import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { getAuthUser } from "@/lib/auth-user";
import { getLang } from "@/lib/i18n-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { eatMonthRange } from "@/lib/quiz";
import { loadMyAnswers, loadTodayQuiz } from "./data";
import { QuizGame } from "./QuizGame";

export const metadata = { title: "Daily Football Quiz · GebetaSoccer", description: "5 football questions a day, 20 seconds each. Free to play. Climb the monthly quiz leaderboard." };
export const dynamic = "force-dynamic";

type Row = { user_id: string; username: string; points: number; perfect_days: number };

export default async function QuizPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const { lang: qLang } = await searchParams;
  const am = qLang === "am" || (qLang !== "en" && (await getLang()) === "am");
  const lang = am ? "am" : "en";
  const [user, quiz] = await Promise.all([getAuthUser(), loadTodayQuiz()]);
  const month = eatMonthRange();
  const admin = createAdminClient();
  const [{ data: board }, answers] = await Promise.all([
    admin.rpc("quiz_leaderboard", { p_from: month.from.toISOString(), p_to: month.to.toISOString(), p_limit: 10 }),
    user && quiz ? loadMyAnswers(user.id, quiz.quizId) : Promise.resolve([]),
  ]);
  const top = (board ?? []) as Row[];
  const total = quiz?.questions.length ?? 5;
  const finished = !!quiz && answers.filter((a) => a.answered_at).length >= total;
  const score = answers.filter((a) => a.is_correct).length;
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-7";

  return (
    <AppShell title={am ? "የእግር ኳስ ጥያቄ" : "Daily Quiz"} next="/quiz">
      <div className="mx-auto max-w-2xl space-y-5">
        <section className={`${card} relative overflow-hidden`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold sm:text-3xl">⚽ {am ? "የዕለቱ የእግር ኳስ ጥያቄ" : "Daily Football Quiz"}</h1>
              <p className="mt-1 text-xs text-mist">{am ? "ነፃ ጨዋታ · ክፍያ የለም · በየቀኑ እኩለ ሌሊት አዲስ ጥያቄ" : "Free to play · no entry fee · new quiz every midnight (EAT)"}</p>
            </div>
            <Link href={`/quiz?lang=${am ? "en" : "am"}`} className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-mist hover:text-white">{am ? "English" : "አማርኛ"}</Link>
          </div>

          {!quiz ? (
            <p className="py-8 text-center text-mist">{am ? "የዛሬው ጥያቄ ገና አልወጣም። ትንሽ ቆይተው ይመለሱ።" : "Today's quiz isn't out yet. Check back soon."}</p>
          ) : finished ? (
            <div>
              <div className="py-4 text-center">
                <p className="text-6xl font-extrabold">{score}<span className="text-2xl text-mist">/{total}</span></p>
                <p className="mt-2 text-lg font-bold">
                  {score === total ? (am ? "🏆 ፍጹም ውጤት!" : "🏆 Perfect score!") : score >= 3 ? (am ? "👏 በጣም ጥሩ!" : "👏 Nice work!") : am ? "ነገ እንደገና ይሞክሩ!" : "Try again tomorrow!"}
                </p>
                <p className="mt-1 text-xs text-mist">{am ? "አዲስ ጥያቄ ዛሬ እኩለ ሌሊት።" : "A new quiz comes out at midnight."}</p>
              </div>
              <ol className="mt-4 space-y-3">
                {quiz.questions.map((q) => {
                  const a = answers.find((x) => x.question_id === q.id);
                  const useAm = am && q.question_am.trim() && q.options_am.length === 4;
                  const opts = useAm ? q.options_am : q.options;
                  return (
                    <li key={q.id} className="rounded-2xl border border-white/10 bg-ink/40 p-4 text-sm">
                      <p className="font-bold">{a?.is_correct ? "✅" : "❌"} {useAm ? q.question_am : q.question}</p>
                      <p className="mt-1 text-mist">
                        {am ? "ትክክለኛው፦" : "Answer:"} <b className="text-emerald-200">{opts[q.correct]}</b>
                        {a && !a.is_correct && a.choice !== null && <> · {am ? "የእርስዎ፦" : "you said"} {opts[a.choice]}</>}
                        {a && a.choice === null && <> · {am ? "ጊዜ አልቋል" : "time ran out"}</>}
                      </p>
                      {(useAm ? q.explanation_am : q.explanation) && <p className="mt-1 text-xs text-mist/80">{useAm ? q.explanation_am : q.explanation}</p>}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : (
            <QuizGame lang={lang} started={answers.length > 0} total={total} />
          )}
        </section>

        <section className={card}>
          <h2 className="mb-1 text-lg font-extrabold">🏅 {am ? "የወሩ ምርጥ 10" : "Top 10 this month"}</h2>
          <p className="mb-4 text-xs text-mist">{month.label} · {am ? "ነጥብ = ትክክለኛ መልሶች" : "points = correct answers"}</p>
          {top.length === 0 ? (
            <p className="text-sm text-mist">{am ? "እስካሁን ማንም አልተጫወተም። የመጀመሪያው ይሁኑ!" : "No scores yet this month. Be the first!"}</p>
          ) : (
            <ol className="divide-y divide-white/5">
              {top.map((r, i) => (
                <li key={r.user_id} className={`flex items-center gap-3 py-2.5 text-sm ${r.user_id === user?.id ? "font-extrabold text-lilac-soft" : ""}`}>
                  <span className="w-7 text-center font-extrabold">{["🥇", "🥈", "🥉"][i] ?? i + 1}</span>
                  <span className="flex-1 truncate">{r.username}</span>
                  {Number(r.perfect_days) > 0 && <span className="text-xs text-mist">🏆×{r.perfect_days}</span>}
                  <span className="w-12 text-right font-extrabold">{r.points}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </AppShell>
  );
}
