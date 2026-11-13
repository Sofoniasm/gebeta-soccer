/** Daily Football Quiz: shared helpers (pure). */

export const QUIZ_SIZE = 5;
export const QUESTION_SECONDS = 20;
/** Network slack on top of the visible timer. */
export const GRACE_SECONDS = 5;

export interface QuizQuestionRow {
  id: number;
  quiz_id: number;
  position: number;
  topic: string;
  question: string;
  question_am: string;
  options: string[];
  options_am: string[];
  correct: number;
  explanation: string;
  explanation_am: string;
}

/** What a player may see before answering: never the correct option. */
export interface PublicQuestion {
  id: number;
  position: number;
  topic: string;
  question: string;
  options: string[];
  seconds: number;
}

export function toPublic(q: QuizQuestionRow, am: boolean, secondsLeft = QUESTION_SECONDS): PublicQuestion {
  const amOk = am && q.question_am.trim() && q.options_am.length === 4 && q.options_am.every((o) => o.trim());
  return {
    id: q.id,
    position: q.position,
    topic: q.topic,
    question: amOk ? q.question_am : q.question,
    options: amOk ? q.options_am : q.options,
    seconds: Math.max(0, Math.round(secondsLeft)),
  };
}

/** Right only if the choice matches and it came in time. */
export function grade(opts: { shownAt: Date; now: Date; choice: number | null; correct: number }): { inTime: boolean; isCorrect: boolean } {
  const elapsed = (opts.now.getTime() - opts.shownAt.getTime()) / 1000;
  const inTime = elapsed <= QUESTION_SECONDS + GRACE_SECONDS;
  return { inTime, isCorrect: inTime && opts.choice !== null && opts.choice === opts.correct };
}

/** UTC range of the current EAT calendar month: [from, to). */
export function eatMonthRange(now = new Date()): { from: Date; to: Date; label: string } {
  const eat = new Date(now.getTime() + 3 * 3_600_000);
  const y = eat.getUTCFullYear();
  const m = eat.getUTCMonth();
  const from = new Date(Date.UTC(y, m, 1) - 3 * 3_600_000);
  const to = new Date(Date.UTC(y, m + 1, 1) - 3 * 3_600_000);
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)));
  return { from, to, label };
}

/** Check an admin-edited / AI-made question before saving. Returns an error or null. */
export function validateQuestion(q: { question: string; options: string[]; correct: number }): string | null {
  if (q.question.trim().length < 10) return "Question is too short.";
  if (q.options.length !== 4 || q.options.some((o) => !o.trim())) return "Every question needs 4 answers.";
  if (new Set(q.options.map((o) => o.trim().toLowerCase())).size !== 4) return "The 4 answers must be different.";
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return "Pick which answer is right.";
  return null;
}
