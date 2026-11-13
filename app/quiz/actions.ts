"use server";

import { getAuthUser } from "@/lib/auth-user";
import { createAdminClient } from "@/lib/supabase/admin";
import { grade, GRACE_SECONDS, QUESTION_SECONDS, toPublic, type PublicQuestion } from "@/lib/quiz";
import { loadMyAnswers, loadTodayQuiz } from "./data";

export type NextResult =
  | { kind: "question"; q: PublicQuestion; answered: number; score: number; total: number }
  | { kind: "done"; score: number; total: number }
  | { kind: "error"; message: string };

export type AnswerResult =
  | { kind: "answer"; isCorrect: boolean; inTime: boolean; correct: number; explanation: string; score: number; answered: number; total: number }
  | { kind: "error"; message: string };

const msg = (am: boolean, en: string, amText: string) => (am ? amText : en);

/** Give the player their next question and start its timer (server clock). */
export async function nextQuestion(am: boolean): Promise<NextResult> {
  const user = await getAuthUser();
  if (!user) return { kind: "error", message: msg(am, "Please log in to play.", "ለመጫወት ይግቡ።") };
  const quiz = await loadTodayQuiz();
  if (!quiz) return { kind: "error", message: msg(am, "Today's quiz isn't ready yet.", "የዛሬው ጥያቄ ገና አልተዘጋጀም።") };
  const admin = createAdminClient();
  const now = Date.now();

  let answers = await loadMyAnswers(user.id, quiz.quizId);
  // A question left open past its time counts as wrong.
  for (const a of answers.filter((x) => !x.answered_at)) {
    const left = QUESTION_SECONDS - (now - Date.parse(a.shown_at)) / 1000;
    if (left > 0) {
      const q = quiz.questions.find((x) => x.id === a.question_id)!;
      const score = answers.filter((x) => x.is_correct).length;
      return { kind: "question", q: toPublic(q, am, left), answered: answers.filter((x) => x.answered_at).length, score, total: quiz.questions.length };
    }
    if (left <= -GRACE_SECONDS) {
      await admin.from("quiz_answers").update({ answered_at: new Date().toISOString(), is_correct: false }).eq("user_id", user.id).eq("question_id", a.question_id).is("answered_at", null);
    }
  }
  answers = await loadMyAnswers(user.id, quiz.quizId);
  const seen = new Set(answers.map((a) => a.question_id));
  const score = answers.filter((a) => a.is_correct).length;
  const next = quiz.questions.find((q) => !seen.has(q.id));
  if (!next) return { kind: "done", score, total: quiz.questions.length };

  const { error } = await admin.from("quiz_answers").insert({ user_id: user.id, question_id: next.id, quiz_id: quiz.quizId });
  if (error && !error.message.includes("duplicate")) return { kind: "error", message: error.message };
  return { kind: "question", q: toPublic(next, am), answered: seen.size, score, total: quiz.questions.length };
}

/** Check an answer. One try per question; late answers count as wrong. */
export async function answerQuestion(questionId: number, choice: number | null, am: boolean): Promise<AnswerResult> {
  const user = await getAuthUser();
  if (!user) return { kind: "error", message: msg(am, "Please log in to play.", "ለመጫወት ይግቡ።") };
  const quiz = await loadTodayQuiz();
  const q = quiz?.questions.find((x) => x.id === questionId);
  if (!quiz || !q) return { kind: "error", message: msg(am, "This question is closed.", "ይህ ጥያቄ ተዘግቷል።") };
  if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice > 3)) return { kind: "error", message: "Bad answer." };

  const admin = createAdminClient();
  const { data: row } = await admin.from("quiz_answers").select("shown_at, answered_at").eq("user_id", user.id).eq("question_id", q.id).maybeSingle();
  if (!row) return { kind: "error", message: msg(am, "Start the question first.", "መጀመሪያ ጥያቄውን ይክፈቱ።") };
  if (row.answered_at) return { kind: "error", message: msg(am, "You already answered this one.", "ይህን ጥያቄ አስቀድመው መልሰዋል።") };

  const g = grade({ shownAt: new Date(row.shown_at), now: new Date(), choice, correct: q.correct });
  const { data: saved } = await admin
    .from("quiz_answers")
    .update({ answered_at: new Date().toISOString(), choice: g.inTime ? choice : null, is_correct: g.isCorrect })
    .eq("user_id", user.id)
    .eq("question_id", q.id)
    .is("answered_at", null)
    .select("id");
  if (!saved?.length) return { kind: "error", message: msg(am, "You already answered this one.", "ይህን ጥያቄ አስቀድመው መልሰዋል።") };

  const answers = await loadMyAnswers(user.id, quiz.quizId);
  const explanation = am && q.explanation_am.trim() ? q.explanation_am : q.explanation;
  return {
    kind: "answer",
    isCorrect: g.isCorrect,
    inTime: g.inTime,
    correct: q.correct,
    explanation,
    score: answers.filter((a) => a.is_correct).length,
    answered: answers.filter((a) => a.answered_at).length,
    total: quiz.questions.length,
  };
}
