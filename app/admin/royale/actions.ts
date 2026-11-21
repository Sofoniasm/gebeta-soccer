"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { aiReady, callClaude, parseJsonObject } from "@/lib/ai";
import { shuffleDraft, validateRoyaleDraft, type RoyaleDraft } from "@/lib/royale";

function back(kind: "msg" | "err", text: string): never {
  revalidatePath("/admin/royale");
  redirect(`/admin/royale?${kind}=${encodeURIComponent(text)}`);
}

/** The AI writes 10 new questions; they wait as DISABLED until an admin has checked every answer. */
export async function generateRoyaleQuestions() {
  await requireAdminId("/admin/royale");
  if (!aiReady()) back("err", "AI is off: add GEMINI_API_KEY in Vercel.");
  const admin = createAdminClient();
  const { data: recent } = await admin.from("royale_questions").select("question").order("id", { ascending: false }).limit(200);
  const avoid = ((recent ?? []) as { question: string }[]).map((r) => `- ${r.question}`).join("\n");

  const system = [
    "You write multiple-choice trivia questions for Quiz Royale, a fast group game for football fans in Ethiopia.",
    "Write exactly 10 questions: 4 about Ethiopian and African football (Walias, Ethiopian Premier League, Africa Cup of Nations, famous African players),",
    "3 about world football history (World Cups, Champions League, Premier League, La Liga), 3 general knowledge easy to medium (Ethiopia, Africa, geography, science).",
    "STRICT RULES:",
    "- Only use facts you are completely sure of and that are well documented. If unsure, choose a better-known fact.",
    "- Only facts from before 2025. Never ask about 'current', 'this season', 'now' or anything that can change.",
    "- Exactly 4 short options (under 40 characters), one clearly right, three plausible but clearly wrong. No 'all of the above'.",
    "- Medium difficulty: a keen fan answers it in 15 seconds.",
    "- Do not repeat these recent questions:\n" + (avoid || "(none)"),
    'Reply with ONLY JSON: {"questions": [{"topic": "football|ethiopia|general", "question": "...", "options": ["...","...","...","..."], "correct": 0}]}',
  ].join("\n");

  let drafts: RoyaleDraft[] = [];
  try {
    const text = await callClaude({ system, user: "Write 10 new questions.", maxTokens: 3000 });
    const parsed = parseJsonObject<{ questions?: Partial<RoyaleDraft>[] }>(text);
    drafts = (parsed.questions ?? []).slice(0, 10).map((q) => ({
      topic: String(q.topic ?? "").slice(0, 30),
      question: String(q.question ?? "").trim(),
      options: (Array.isArray(q.options) ? q.options : []).map((o) => String(o).trim()),
      correct: Number(q.correct),
    }));
  } catch (e) {
    back("err", `AI error: ${(e as Error).message}. Try again.`);
  }
  const good: RoyaleDraft[] = [];
  for (const d of drafts) if (!validateRoyaleDraft(d)) good.push(shuffleDraft(d));
  if (good.length === 0) back("err", "The AI did not return usable questions. Try again.");
  const { error } = await admin.from("royale_questions").insert(good.map((q) => ({ question: q.question, options: q.options, correct: q.correct, topic: q.topic || null, active: false })));
  if (error) back("err", error.message);
  back("msg", `${good.length} questions added as DISABLED. Check every answer, then press Enable.`);
}

export async function setRoyaleQuestionActive(formData: FormData) {
  await requireAdminId("/admin/royale");
  const id = Number(formData.get("id"));
  const active = formData.get("active") === "1";
  if (!Number.isInteger(id) || id <= 0) back("err", "Unknown question.");
  const { error } = await createAdminClient().from("royale_questions").update({ active }).eq("id", id);
  if (error) back("err", error.message);
  back("msg", active ? "Question enabled." : "Question disabled.");
}

export async function deleteRoyaleQuestion(formData: FormData) {
  await requireAdminId("/admin/royale");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) back("err", "Unknown question.");
  const { error } = await createAdminClient().from("royale_questions").delete().eq("id", id);
  if (error) back("err", "This question was already used in a game, so it can't be deleted. Disable it instead.");
  back("msg", "Question deleted.");
}
