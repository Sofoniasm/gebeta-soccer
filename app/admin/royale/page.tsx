import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { SubmitButton } from "../SubmitButton";
import { deleteRoyaleQuestion, generateRoyaleQuestions, setRoyaleQuestionActive } from "./actions";

export const metadata = { title: "Quiz Royale · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI generation can take 10-30 seconds

interface Q {
  id: number;
  question: string;
  options: string[];
  correct: number;
  topic: string | null;
  active: boolean;
}

export default async function AdminRoyalePage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdminId("/admin/royale");
  const sp = await searchParams;
  const admin = createAdminClient();
  const [{ data }, { count: rooms }] = await Promise.all([
    admin.from("royale_questions").select("id, question, options, correct, topic, active").order("active", { ascending: true }).order("id", { ascending: false }).limit(120),
    admin.from("royale_rooms").select("id", { count: "exact", head: true }),
  ]);
  const qs = (data ?? []) as Q[];
  const activeCount = qs.filter((q) => q.active).length;
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";

  return (
    <AppShell title="Quiz Royale" next="/admin/royale">
      {sp.msg && <div className="mb-4"><Banner kind="success">{sp.msg}</Banner></div>}
      {sp.err && <div className="mb-4"><Banner kind="error">{sp.err}</Banner></div>}
      <section className={`${card} mb-5`}>
        <p className="text-sm text-mist">
          Question bank for Quiz Royale. Each game picks 10 enabled questions at random: <b className="text-white">{activeCount} enabled</b> now (shown below, newest first). Rooms played so far: {rooms ?? 0}.
          AI-written questions start DISABLED: check every right answer (AI can be wrong), then press Enable.
        </p>
        <form action={generateRoyaleQuestions} className="mt-4">
          <SubmitButton>✨ Write 10 new questions with AI (takes up to 30 s)</SubmitButton>
        </form>
      </section>

      <section className={card}>
        <ul className="divide-y divide-white/5">
          {qs.map((q) => (
            <li key={q.id} className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${q.active ? "bg-emerald-400/15 text-emerald-200" : "bg-amber-200/15 text-amber-100"}`}>{q.active ? "Enabled" : "Disabled: check it"}</span>
                {q.topic && <span className="text-[10px] font-bold uppercase tracking-widest text-mist">{q.topic}</span>}
              </div>
              <p className="mt-1 text-sm font-bold">{q.question}</p>
              <ul className="mt-1 grid gap-0.5 text-xs text-mist sm:grid-cols-2">
                {q.options.map((o, i) => (
                  <li key={i} className={i === q.correct ? "font-bold text-emerald-200" : ""}>{i === q.correct ? "✔ " : "· "}{o}</li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <form action={setRoyaleQuestionActive}>
                  <input type="hidden" name="id" value={q.id} />
                  <input type="hidden" name="active" value={q.active ? "0" : "1"} />
                  <button className="rounded-full border border-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-white/10">{q.active ? "Disable" : "Enable"}</button>
                </form>
                <form action={deleteRoyaleQuestion}>
                  <input type="hidden" name="id" value={q.id} />
                  <button className="rounded-full border border-rose-300/30 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-200 hover:bg-rose-300/10">Delete</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
