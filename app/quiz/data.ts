/** Server-side quiz data access (service role; players never query these tables directly). */
import { createAdminClient } from "@/lib/supabase/admin";
import { eatDate } from "@/lib/round-slots";
import type { QuizQuestionRow } from "@/lib/quiz";

export interface AnswerRow { question_id: number; shown_at: string; answered_at: string | null; choice: number | null; is_correct: boolean }

export async function loadTodayQuiz(): Promise<{ quizId: number; date: string; questions: QuizQuestionRow[] } | null> {
  const admin = createAdminClient();
  const date = eatDate();
  const { data: day } = await admin.from("quiz_days").select("id").eq("quiz_date", date).eq("status", "published").maybeSingle();
  if (!day) return null;
  const { data: qs } = await admin.from("quiz_questions").select("*").eq("quiz_id", day.id).order("position");
  const questions = (qs ?? []) as QuizQuestionRow[];
  return questions.length ? { quizId: day.id, date, questions } : null;
}

export async function loadMyAnswers(userId: string, quizId: number): Promise<AnswerRow[]> {
  const { data } = await createAdminClient()
    .from("quiz_answers")
    .select("question_id, shown_at, answered_at, choice, is_correct")
    .eq("user_id", userId)
    .eq("quiz_id", quizId);
  return (data ?? []) as AnswerRow[];
}
