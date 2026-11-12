import Link from "next/link";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminId } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppShell } from "@/components/AppShell";
import { Banner, inputClass } from "@/components/ui";
import { ALL_COMPETITIONS, SITE_SETTINGS_TAG, getSiteSettings } from "@/lib/site-settings";
import { syncMatches } from "@/lib/football/sync";
import { createDueAutoRounds, SLOTS, slotHours } from "@/lib/auto-rounds";
import { SubmitButton } from "../SubmitButton";

export const metadata = { title: "Site · Admin · GebetaSoccer" };
export const dynamic = "force-dynamic";

const MAX_LEAGUES = 9; // football-data.org free plan: 10 requests a minute, one per league per sync

function back(kind: "msg" | "err", text: string): never {
  updateTag(SITE_SETTINGS_TAG); // the saved settings show up immediately
  revalidatePath("/", "layout");
  redirect(`/admin/site?${kind}=${encodeURIComponent(text)}`);
}

async function saveSettings(formData: FormData) {
  "use server";
  await requireAdminId("/admin/site");
  const tg = String(formData.get("telegram_support") ?? "").trim();
  const channel = String(formData.get("telegram_channel") ?? "").trim();
  const email = String(formData.get("contact_email") ?? "").trim();
  const phone = String(formData.get("contact_phone") ?? "").trim();
  const comps = formData.getAll("competitions").map(String).filter((c) => ALL_COMPETITIONS.some((x) => x.code === c));
  const stats = formData.get("show_public_stats") === "on";
  const autoRounds = formData.get("auto_rounds") === "on";
  const autoFee = Number(formData.get("auto_round_fee"));

  const tgOk = (v: string) => /^https:\/\/t\.me\/[A-Za-z0-9_+/]{3,}$/.test(v);
  if (!tgOk(tg)) back("err", "Support Telegram link must look like https://t.me/YourName");
  if (channel && !tgOk(channel)) back("err", "Channel link must look like https://t.me/YourChannel (or leave it empty)");
  if (email && !/^\S+@\S+\.\S+$/.test(email)) back("err", "That email doesn't look right.");
  if (comps.length === 0) back("err", "Pick at least one league.");
  if (!Number.isFinite(autoFee) || autoFee < 0.5 || autoFee > 50) back("err", "Automatic round entry fee must be between 0.5 and 50 Units.");
  if (comps.length > MAX_LEAGUES) back("err", `Pick at most ${MAX_LEAGUES} leagues (the free football data plan allows 10 requests a minute).`);

  const now = new Date().toISOString();
  const rows = [
    { key: "telegram_support", value: tg },
    { key: "telegram_channel", value: channel },
    { key: "contact_email", value: email },
    { key: "contact_phone", value: phone },
    { key: "competitions", value: comps },
    { key: "show_public_stats", value: stats },
    { key: "auto_rounds", value: autoRounds },
    { key: "auto_round_fee", value: Math.round(autoFee * 2) / 2 },
  ].map((r) => ({ ...r, updated_at: now }));
  const { error } = await createAdminClient().from("site_settings").upsert(rows, { onConflict: "key" });
  if (error) back("err", `Could not save: ${error.message}. Did you run the 0026 SQL?`);
  back("msg", "Saved. The whole site uses the new settings now.");
}

async function syncNowFromSite() {
  "use server";
  await requireAdminId("/admin/site");
  const r = await syncMatches({ daysBack: 3, daysAhead: 7 });
  const auto = await createDueAutoRounds();
  const autoNote = auto.length ? ` Automatic rounds: ${auto.join("; ")}.` : " No new automatic round (no slot with 10 free matches, or already made).";
  back(r.ok ? "msg" : "err", (r.ok ? `Synced ${r.upserted} matches from ${r.competitions.join(", ")}.` : `Sync finished with errors: ${r.errors.join(" | ")}`) + autoNote);
}

async function loadHistory() {
  "use server";
  await requireAdminId("/admin/site");
  const r = await syncMatches({ history: true });
  back(
    r.ok ? "msg" : "err",
    r.ok
      ? `Loaded ${r.upserted} finished matches from ${r.competitions.join(", ")}. The team form bars now use them.`
      : `Some leagues failed: ${r.errors.join(" | ")} (the free plan allows 10 requests a minute; wait a minute and try again).`,
  );
}

export default async function AdminSitePage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await requireAdminId("/admin/site");
  const { msg, err } = await searchParams;
  const s = await getSiteSettings();
  const admin = createAdminClient();
  const { data: up } = await admin
    .from("matches")
    .select("competition")
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString())
    .limit(2000);
  const count = new Map<string, number>();
  for (const m of (up ?? []) as { competition: string | null }[]) count.set(m.competition ?? "", (count.get(m.competition ?? "") ?? 0) + 1);

  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-5 sm:p-6";
  const label = "mb-1.5 block text-xs font-bold uppercase tracking-widest text-mist";

  return (
    <AppShell title="Site settings" next="/admin/site">
      {msg && <div className="mb-4"><Banner kind="success">{msg}</Banner></div>}
      {err && <div className="mb-4"><Banner kind="error">{err}</Banner></div>}

      <form action={saveSettings} className="space-y-5">
        <section className={card}>
          <h2 className="mb-1 text-lg font-extrabold">Telegram & contact</h2>
          <p className="mb-4 text-sm text-mist">Used everywhere: footer, wallet (deposits), How to play, Get the app, For businesses, Terms.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={label} htmlFor="telegram_support">Support / deposits Telegram</label>
              <input id="telegram_support" name="telegram_support" required defaultValue={s.telegram_support} placeholder="https://t.me/GebetaSoccerSupport" className={inputClass} />
            </div>
            <div>
              <label className={label} htmlFor="telegram_channel">Announcements channel (optional)</label>
              <input id="telegram_channel" name="telegram_channel" defaultValue={s.telegram_channel} placeholder="https://t.me/GebetaSoccerOfficial" className={inputClass} />
            </div>
            <div>
              <label className={label} htmlFor="contact_email">Business email (optional)</label>
              <input id="contact_email" name="contact_email" type="email" defaultValue={s.contact_email} placeholder="hello@gebetasoccer.com" className={inputClass} />
            </div>
            <div>
              <label className={label} htmlFor="contact_phone">Business phone (optional)</label>
              <input id="contact_phone" name="contact_phone" defaultValue={s.contact_phone} placeholder="+251 9.. ... ..." className={inputClass} />
            </div>
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-1 text-lg font-extrabold">Leagues to follow</h2>
          <p className="mb-4 text-sm text-mist">
            Match sync pulls fixtures and results for these leagues. More leagues = more matches to pick for daily rounds and challenges. Up to {MAX_LEAGUES}.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {ALL_COMPETITIONS.map((c) => (
              <label key={c.code} className="flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-ink/40 px-3 py-2.5 text-sm hover:border-white/25">
                <input type="checkbox" name="competitions" value={c.code} defaultChecked={s.competitions.includes(c.code)} className="h-4 w-4 accent-violet-300" />
                <span className="min-w-0 flex-1">
                  <b className="text-white">{c.label}</b> <span className="text-xs text-mist">{c.country}</span>
                </span>
                <span className="text-[11px] text-mist">{count.get(c.name) ? `${count.get(c.name)} upcoming` : ""}</span>
              </label>
            ))}
          </div>
        </section>

        <section className={card}>
          <h2 className="mb-1 text-lg font-extrabold">Automatic daily rounds</h2>
          <p className="mb-4 text-sm text-mist">
            Every match sync opens a round by itself for each time slot (Ethiopian time) that has 10 matches from your leagues, for today and tomorrow.
            Matches never mix slots. The round locks at its first kickoff and pays out by itself when its last match ends.
          </p>
          <ul className="mb-4 grid gap-2 sm:grid-cols-3">
            {SLOTS.map((x) => (
              <li key={x.key} className="rounded-2xl border border-white/10 bg-ink/40 px-3 py-2.5 text-sm">
                <b className="text-white">{x.emoji} {x.label}</b>
                <span className="block text-xs text-mist">Kickoffs {slotHours(x.key)}</span>
              </li>
            ))}
          </ul>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="auto_rounds" defaultChecked={s.auto_rounds} className="mt-0.5 h-4 w-4 accent-violet-300" />
            <span>
              <b className="text-white">Create rounds automatically</b>
              <span className="block text-xs text-mist">Turn off to only use rounds you create by hand in Admin (the Create round button always works).</span>
            </span>
          </label>
          <label className="mt-4 block max-w-xs space-y-1.5">
            <span className="text-sm font-medium text-mist">Entry fee per slip (Units)</span>
            <input name="auto_round_fee" type="number" step="0.5" min="0.5" max="50" defaultValue={s.auto_round_fee} className={inputClass} />
            <span className="block text-xs text-mist">1 Unit = 200 ETB. Applies to new automatic rounds.</span>
          </label>
        </section>

        <section className={card}>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="show_public_stats" defaultChecked={s.show_public_stats} className="mt-0.5 h-4 w-4 accent-violet-300" />
            <span>
              <b className="text-white">Show player numbers publicly</b>
              <span className="block text-xs text-mist">Shows “registered players / predictions / rounds” on About, For businesses and the home page. Leave off until the numbers look good.</span>
            </span>
          </label>
        </section>

        <SubmitButton className="inline-flex w-full items-center justify-center rounded-full bg-lilac px-6 py-3.5 text-sm font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">Save settings</SubmitButton>
      </form>

      <section className={`${card} mt-5 flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm text-mist">After changing leagues, sync so the new fixtures show up straight away.</p>
        <form action={syncNowFromSite}>
          <SubmitButton className="rounded-full border border-white/60 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">Sync matches now</SubmitButton>
        </form>
      </section>
      <section className={`${card} mt-5 flex flex-wrap items-center justify-between gap-3`}>
        <p className="text-sm text-mist">
          <b className="text-white">Team form bars</b> (last 5 results on each pick card) need past results. Press once after adding a league;
          normal syncs keep them up to date. Uses one request per league.
        </p>
        <form action={loadHistory}>
          <SubmitButton className="rounded-full border border-white/60 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/10">Load past results</SubmitButton>
        </form>
      </section>
      <p className="mt-4 text-xs text-mist">
        Pages: <Link href="/tournaments" className="text-lilac">Tournaments</Link> · <Link href="/about" className="text-lilac">About</Link> · <Link href="/business" className="text-lilac">For businesses</Link> · <Link href="/apps" className="text-lilac">Get the app</Link>
      </p>
    </AppShell>
  );
}
