"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiReady, callClaude } from "@/lib/ai";
import { QUIZ_SIZE, validateQuestion } from "@/lib/quiz";

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

function back(date: string, kind: "msg" | "err", text: string): never {
  revalidatePath("/admin/quiz");
  revalidatePath("/quiz");
  redirect(`/admin/quiz?date=${date}&${kind}=${encodeURIComponent(text)}`);
}

interface Draft { topic: string; question: string; options: string[]; correct: number; explanation: string; question_am: string; options_am: string[]; explanation_am: string }

/** Move the right answer to a random slot (AI tends to put it first), keeping Amharic options in step. */
function shuffle(q: Draft): Draft {
  const order = [0, 1, 2, 3].sort(() => Math.random() - 0.5);
  const am = q.options_am.length === 4 ? order.map((i) => q.options_am[i]) : q.options_am;
  return { ...q, options: order.map((i) => q.options[i]), options_am: am, correct: order.indexOf(q.correct) };
}

async function playedCount(quizId: number): Promise<number> {
  const { count } = await createAdminClient().from("quiz_answers").select("id", { count: "exact", head: true }).eq("quiz_id", quizId);
  return count ?? 0;
}

async function saveDraft(date: string, adminId: string, qs: Draft[]): Promise<string | null> {
  const admin = createAdminClient();
  const { data: existing } = await admin.from("quiz_days").select("id, status").eq("quiz_date", date).maybeSingle();
  let quizId = existing?.id as number | undefined;
  if (existing) {
    if (existing.status === "published") return "This quiz is published. Unpublish it first.";
    if ((await playedCount(existing.id)) > 0) return "People already played this quiz, so it can't be replaced.";
    await admin.from("quiz_questions").delete().eq("quiz_id", existing.id);
  } else {
    const { data, error } = await admin.from("quiz_days").insert({ quiz_date: date, created_by: adminId }).select("id").single();
    if (error) return error.message;
    quizId = data.id;
  }
  const { error } = await admin.from("quiz_questions").insert(
    qs.map((q, i) => ({ quiz_id: quizId, position: i + 1, topic: q.topic, question: q.question, question_am: q.question_am, options: q.options, options_am: q.options_am, correct: q.correct, explanation: q.explanation, explanation_am: q.explanation_am })),
  );
  return error ? error.message : null;
}

export async function generateQuiz(formData: FormData) {
  const adminId = await requireAdminId("/admin/quiz");
  const date = String(formData.get("date") ?? "");
  if (!isDate(date)) back(date, "err", "Pick a date.");
  if (!aiReady()) back(date, "err", "AI is off: add ANTHROPIC_API_KEY in Vercel.");

  const { data: recent } = await createAdminClient().from("quiz_questions").select("question").order("id", { ascending: false }).limit(150);
  const avoid = ((recent ?? []) as { question: string }[]).map((r) => `- ${r.question}`).join("\n");

  const system = [
    "You write a daily 5-question multiple-choice football quiz for GebetaSoccer, a free football game for fans in Ethiopia.",
    "Questions, in this order:",
    "1. Ethiopian football (Walias national team, Ethiopian Premier League, famous Ethiopian clubs or players, Ethiopia at the Africa Cup of Nations).",
    "2. and 3. English Premier League history.",
    "4. UEFA Champions League / European Cup history.",
    "5. Africa Cup of Nations or FIFA World Cup history.",
    "STRICT RULES:",
    "- Only use facts you are completely sure of and that are well documented. If unsure about a fact, choose a different, better-known fact.",
    "- Only facts from before 2025. Never ask about 'current', 'this season', 'now' or anything that can change.",
    "- Exactly 4 short options, one clearly right, three plausible but clearly wrong. No 'all of the above', no trick wording.",
    "- Medium difficulty: a keen fan should get 3 or 4 right.",
    "- explanation: one short sentence stating the fact.",
    "- Amharic (question_am, options_am, explanation_am): natural Ethiopian Amharic; keep club, player and competition names in English letters; numbers and years as digits; options_am in the same order as options.",
    "- Do not repeat these recent questions:\n" + (avoid || "(none)"),
    'Reply with ONLY JSON: {"questions": [{"topic": "Ethiopian football", "question": "...", "options": ["...","...","...","..."], "correct": 0, "explanation": "...", "question_am": "...", "options_am": ["...","...","...","..."], "explanation_am": "..."}]}',
  ].join("\n");

  let qs: Draft[] = [];
  try {
    const text = await callClaude({ system, user: `Write the quiz for ${date}.`, maxTokens: 4000 });
    const start = text.indexOf("{");
    const parsed = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)) as { questions?: Draft[] };
    qs = (parsed.questions ?? []).slice(0, QUIZ_SIZE).map((q) => ({
      topic: String(q.topic ?? "").slice(0, 40),
      question: String(q.question ?? "").trim(),
      options: (Array.isArray(q.options) ? q.options : []).map((o) => String(o).trim()),
      correct: Number(q.correct),
      explanation: String(q.explanation ?? "").trim(),
      question_am: String(q.question_am ?? "").trim(),
      options_am: (Array.isArray(q.options_am) ? q.options_am : []).map((o) => String(o).trim()),
      explanation_am: String(q.explanation_am ?? "").trim(),
    }));
  } catch (e) {
    back(date, "err", `AI error: ${(e as Error).message}. Try again.`);
  }
  if (qs.length !== QUIZ_SIZE) back(date, "err", "The AI didn't return 5 questions. Try again.");
  for (const [i, q] of qs.entries()) {
    const bad = validateQuestion(q);
    if (bad) back(date, "err", `AI question ${i + 1}: ${bad} Try again.`);
  }
  const err = await saveDraft(date, adminId, qs.map(shuffle));
  if (err) back(date, "err", err);
  back(date, "msg", "Draft ready. Check every answer is really right (AI can be wrong), fix anything, then Publish.");
}

export async function saveQuiz(formData: FormData) {
  const adminId = await requireAdminId("/admin/quiz");
  const date = String(formData.get("date") ?? "");
  if (!isDate(date)) back(date, "err", "Pick a date.");
  const qs: Draft[] = [];
  for (let i = 1; i <= QUIZ_SIZE; i++) {
    const g = (k: string) => String(formData.get(`q${i}_${k}`) ?? "").trim();
    const q: Draft = {
      topic: g("topic").slice(0, 40),
      question: g("question"),
      options: [0, 1, 2, 3].map((j) => g(`o${j}`)),
      correct: Number(formData.get(`q${i}_correct`)),
      explanation: g("explanation"),
      question_am: g("question_am"),
      options_am: [0, 1, 2, 3].map((j) => g(`oam${j}`)),
      explanation_am: g("explanation_am"),
    };
    if (q.options_am.every((o) => !o)) q.options_am = [];
    else if (q.options_am.some((o) => !o)) back(date, "err", `Question ${i}: fill all 4 Amharic answers, or leave all 4 empty.`);
    const bad = validateQuestion(q);
    if (bad) back(date, "err", `Question ${i}: ${bad}`);
    qs.push(q);
  }
  const admin = createAdminClient();
  const { data: day } = await admin.from("quiz_days").select("id, status").eq("quiz_date", date).maybeSingle();
  if (day && (await playedCount(day.id)) > 0) back(date, "err", "People already played this quiz, so it is locked.");
  if (day?.status === "published") {
    // Not played yet: edit in place and keep it live.
    await admin.from("quiz_days").update({ status: "draft" }).eq("id", day.id);
    const err = await saveDraft(date, adminId, qs);
    await admin.from("quiz_days").update({ status: "published" }).eq("id", day.id);
    if (err) back(date, "err", err);
    back(date, "msg", "Saved. The quiz is still live.");
  }
  const err = await saveDraft(date, adminId, qs);
  if (err) back(date, "err", err);
  back(date, "msg", "Saved as draft.");
}

export async function setQuizStatus(formData: FormData) {
  await requireAdminId("/admin/quiz");
  const date = String(formData.get("date") ?? "");
  const publish = formData.get("publish") === "1";
  const admin = createAdminClient();
  const { data: day } = await admin.from("quiz_days").select("id").eq("quiz_date", date).maybeSingle();
  if (!day) back(date, "err", "No quiz for that date.");
  if (publish) {
    const { count } = await admin.from("quiz_questions").select("id", { count: "exact", head: true }).eq("quiz_id", day.id);
    if ((count ?? 0) !== QUIZ_SIZE) back(date, "err", "The quiz needs 5 questions before it can go live.");
  } else if ((await playedCount(day.id)) > 0) {
    back(date, "err", "People already played it, so it stays live.");
  }
  await admin.from("quiz_days").update({ status: publish ? "published" : "draft", published_at: publish ? new Date().toISOString() : null }).eq("id", day.id);
  back(date, "msg", publish ? "Published. Players can play it on that day." : "Back to draft.");
}

export async function deleteQuiz(formData: FormData) {
  await requireAdminId("/admin/quiz");
  const date = String(formData.get("date") ?? "");
  const admin = createAdminClient();
  const { data: day } = await admin.from("quiz_days").select("id").eq("quiz_date", date).maybeSingle();
  if (!day) back(date, "err", "No quiz for that date.");
  if ((await playedCount(day.id)) > 0) back(date, "err", "People already played it, so it can't be deleted.");
  await admin.from("quiz_days").delete().eq("id", day.id);
  back(date, "msg", "Deleted.");
}
