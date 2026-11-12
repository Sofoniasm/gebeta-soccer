/**
 * Automatic daily rounds in Ethiopian time (EAT, UTC+3, no daylight saving).
 * Every match sync calls createDueAutoRounds(): for today and tomorrow it
 * makes one round per time slot that has 10 matches, opens it and marks it
 * "settle automatically". Matches never mix slots, so nobody waits 12 hours.
 * The database allows one round per slot per day (0030).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_COMPETITIONS, getSiteSettings } from "@/lib/site-settings";

export * from "./round-slots";
import { SLOTS, pickSlotMatches, slotWindow, eatDate, autoRoundName, type Slot } from "./round-slots";

/** Create and open every due automatic round. Returns a line per round made. Never throws. */
export async function createDueAutoRounds(now = new Date()): Promise<string[]> {
  const out: string[] = [];
  try {
    const settings = await getSiteSettings();
    if (!settings.auto_rounds) return out;
    const admin = createAdminClient();
    const leagueNames: string[] = ALL_COMPETITIONS.filter((c) => settings.competitions.includes(c.code)).map((c) => c.name);

    const dates = [eatDate(now), eatDate(now, 1)];
    const { start } = slotWindow(dates[0], "morning");
    const { end } = slotWindow(dates[1], "night");
    const { data: free } = await admin
      .from("matches")
      .select("id, kickoff_at, competition")
      .is("round_id", null)
      .eq("status", "scheduled")
      .gte("kickoff_at", start.toISOString())
      .lt("kickoff_at", end.toISOString())
      .order("kickoff_at");
    const pool = ((free ?? []) as { id: number; kickoff_at: string; competition: string | null }[]).filter(
      (m) => leagueNames.length === 0 || (m.competition !== null && leagueNames.includes(m.competition)),
    );
    const { data: existing } = await admin.from("rounds").select("auto_date, auto_slot").in("auto_date", dates).not("auto_slot", "is", null);
    const have = new Set(((existing ?? []) as { auto_date: string; auto_slot: string }[]).map((r) => `${r.auto_date}:${r.auto_slot}`));

    for (const date of dates) {
      for (const s of SLOTS) {
        if (have.has(`${date}:${s.key}`)) continue;
        const picked = pickSlotMatches(pool, date, s.key, now);
        if (!picked) continue;
        const msg = await createOne(date, s.key, picked.map((m) => m.id), settings.auto_round_fee);
        out.push(msg);
        const used = new Set(picked.map((m) => m.id));
        for (let i = pool.length - 1; i >= 0; i--) if (used.has(pool[i].id)) pool.splice(i, 1);
      }
    }
  } catch (e) {
    out.push(`auto rounds error: ${(e as Error).message}`);
  }
  return out;
}

async function createOne(date: string, slot: Slot, ids: number[], fee: number): Promise<string> {
  const admin = createAdminClient();
  const name = autoRoundName(date, slot);
  const { data: round, error } = await admin
    .from("rounds")
    .insert({ name, entry_fee_units: fee, status: "draft", auto_settle: true, auto_slot: slot, auto_date: date })
    .select("id")
    .single();
  if (error || !round) return `${name}: not created (${error?.message ?? "unknown"})`; // e.g. made by a parallel sync
  const { data: got } = await admin
    .from("matches")
    .update({ round_id: round.id })
    .in("id", ids)
    .is("round_id", null)
    .eq("status", "scheduled")
    .select("id");
  if ((got ?? []).length !== 10) {
    // Someone took a match meanwhile: undo and try again at the next sync.
    await admin.from("matches").update({ round_id: null }).eq("round_id", round.id);
    await admin.from("rounds").delete().eq("id", round.id);
    return `${name}: skipped, matches changed while creating`;
  }
  const { error: openErr } = await admin.from("rounds").update({ status: "open" }).eq("id", round.id);
  return openErr ? `${name}: created but not opened (${openErr.message})` : `${name}: opened`;
}
