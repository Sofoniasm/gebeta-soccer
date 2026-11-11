import Link from "next/link";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Banner, inputClass } from "@/components/ui";
import { Crest, dayOf, timeOf } from "@/components/MatchLine";
import { MATCH_COLS, predictionPath, type MatchPreview, type PredictionMatch } from "@/lib/predictions";
import { SubmitButton } from "../SubmitButton";
import { deletePreview, savePreview } from "./actions";

export const metadata = { title: "Match previews · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function AdminPreviewsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string; match?: string; all?: string }> }) {
  await requireAdminId("/admin/previews");
  const { msg, err, match, all } = await searchParams;
  const admin = createAdminClient();
  const from = new Date(Date.now() - 3 * 86400 * 1000).toISOString();
  const to = new Date(Date.now() + 14 * 86400 * 1000).toISOString();

  const [{ data: mData }, { data: pData }, { data: rData }] = await Promise.all([
    admin.from("matches").select(MATCH_COLS).gte("kickoff_at", from).lte("kickoff_at", to).order("kickoff_at").limit(400),
    admin.from("match_previews").select("*"),
    admin.from("rounds").select("id, name, status").in("status", ["draft", "open", "locked"]),
  ]);
  const matches = (mData ?? []) as PredictionMatch[];
  const previews = new Map(((pData ?? []) as MatchPreview[]).map((p) => [p.match_id, p]));
  const rounds = new Map(((rData ?? []) as { id: number; name: string; status: string }[]).map((r) => [r.id, r]));
  const inRound = (m: PredictionMatch) => m.round_id !== null && rounds.has(m.round_id);

  const selected = match ? matches.find((m) => m.id === Number(match)) ?? null : null;
  const pv = selected ? previews.get(selected.id) ?? null : null;
  const list = all ? matches : matches.filter((m) => inRound(m) || previews.has(m.id));
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";
  const label = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist";

  return (
    <AppShell title="Match previews" next="/admin/previews">
      {msg && <div className="mb-4"><Banner kind="success">{msg}</Banner></div>}
      {err && <div className="mb-4"><Banner kind="error">{err}</Banner></div>}

      {selected ? (
        <section className={`${card} mb-5`}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] text-mist">{dayOf(selected.kickoff_at)} · {timeOf(selected.kickoff_at)} · {selected.competition}</p>
              <h2 className="mt-1 flex flex-wrap items-center gap-2 text-lg font-extrabold">
                <Crest src={selected.home_crest} name={selected.home_team} size={22} /> {selected.home_team} vs {selected.away_team}
                <Crest src={selected.away_crest} name={selected.away_team} size={22} />
              </h2>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1 text-xs font-bold uppercase tracking-wider">
              <Link href={predictionPath(selected)} target="_blank" className="text-lilac hover:text-lilac-soft">View page</Link>
              <Link href="/admin/previews" className="text-mist hover:text-white">Close</Link>
            </div>
          </div>

          <form action={savePreview} className="space-y-5">
            <input type="hidden" name="match_id" value={selected.id} />
            <div>
              <span className={label}>Our predicted score</span>
              <div className="flex items-center gap-3">
                <span className="w-28 truncate text-right text-sm font-semibold">{selected.home_team}</span>
                <input name="pick_home" inputMode="numeric" required defaultValue={pv?.pick_home ?? ""} className="h-12 w-14 rounded-2xl border border-white/15 bg-ink text-center text-xl font-extrabold" />
                <span className="text-mist">:</span>
                <input name="pick_away" inputMode="numeric" required defaultValue={pv?.pick_away ?? ""} className="h-12 w-14 rounded-2xl border border-white/15 bg-ink text-center text-xl font-extrabold" />
                <span className="w-28 truncate text-sm font-semibold">{selected.away_team}</span>
              </div>
            </div>
            <div>
              <label className={label} htmlFor="confidence">Confidence</label>
              <select id="confidence" name="confidence" defaultValue={pv?.confidence ?? "medium"} className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="verdict">Short answer (shown first; Google and AI quote this)</label>
              <textarea
                id="verdict"
                name="verdict"
                required
                minLength={20}
                maxLength={400}
                rows={3}
                defaultValue={pv?.verdict}
                placeholder={`${selected.home_team} are unbeaten in 6 at home and ${selected.away_team} are missing their top scorer, so we back a narrow home win.`}
                className={`${inputClass} resize-y`}
              />
              <p className="mt-1 text-[11px] text-mist/70">1 or 2 sentences, under 50 words: the reason for your tip. The score itself is added automatically in front.</p>
            </div>
            <div>
              <label className={label} htmlFor="body">Analysis (optional)</label>
              <textarea
                id="body"
                name="body"
                rows={10}
                defaultValue={pv?.body}
                placeholder={"## Form\n\n- Arsenal: W W D W W\n- Chelsea: L W D L W\n\n## Team news\n\nWho is injured or suspended...\n\n## Key stat\n\n> Arsenal have scored in 15 straight home games."}
                className={`${inputClass} resize-y font-mono text-sm`}
              />
              <p className="mt-1 text-[11px] text-mist/70">Empty line = new paragraph · ## heading · - bullet · **bold** · &gt; highlight. Real facts (form, injuries, head-to-head) help ranking most.</p>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input type="checkbox" name="published" defaultChecked={pv ? pv.is_published !== false : true} className="h-4 w-4 accent-[#b4a7f5]" />
              Published (visible to everyone and to Google)
            </label>
            <SubmitButton className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-lilac px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
              {pv ? "Save preview" : "Publish preview"}
            </SubmitButton>
          </form>
          {pv && (
            <form action={deletePreview} className="mt-4 border-t border-white/5 pt-4">
              <input type="hidden" name="match_id" value={selected.id} />
              <SubmitButton confirm="Delete this preview?" className="text-xs font-bold uppercase tracking-wider text-rose-200 hover:text-rose-100">
                Delete preview
              </SubmitButton>
            </form>
          )}
        </section>
      ) : (
        <p className="mb-5 text-sm text-mist">
          Write a score tip for a match and it gets its own public page, e.g. <b className="text-white">/predictions/arsenal-vs-chelsea-123</b>, ready for Google and AI assistants.
          Matches in a round always have a page; other matches are only shown to Google once they have a preview.
        </p>
      )}

      <section className={card}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">{all ? "All matches (next 14 days)" : "Round matches & previews"}</h2>
          <Link href={all ? "/admin/previews" : "/admin/previews?all=1"} className="text-xs font-bold uppercase tracking-wider text-lilac">
            {all ? "Round only" : "Show all matches"}
          </Link>
        </div>
        {list.length === 0 && <p className="text-sm text-mist">No matches. Sync matches or open a round first, or tap “Show all matches”.</p>}
        <ul className="divide-y divide-white/5">
          {list.map((m) => {
            const p = previews.get(m.id);
            return (
              <li key={m.id} className={`flex items-center gap-3 py-3 ${selected?.id === m.id ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-mist">
                    {dayOf(m.kickoff_at)} · {timeOf(m.kickoff_at)} · {m.competition}
                    {inRound(m) && <span className="ml-2 rounded-full bg-lilac/20 px-1.5 py-0.5 text-[9px] font-bold uppercase text-lilac-soft">Round</span>}
                  </p>
                  <p className="truncate text-sm font-bold">{m.home_team} vs {m.away_team}</p>
                  <p className="text-xs text-mist">
                    {p ? `Tip ${p.pick_home}-${p.pick_away} · ${p.is_published === false ? "draft" : "published"}` : "No preview yet"}
                  </p>
                </div>
                <Link
                  href={`/admin/previews?match=${m.id}${all ? "&all=1" : ""}`}
                  className={`shrink-0 rounded-full px-4 py-2 text-xs font-bold uppercase tracking-wider ${p ? "border border-white/20 text-white hover:bg-white/10" : "bg-lilac text-ink hover:bg-lilac-soft"}`}
                >
                  {p ? "Edit" : "Write"}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </AppShell>
  );
}
