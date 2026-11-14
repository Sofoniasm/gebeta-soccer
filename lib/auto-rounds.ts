/**
 * Automatic daily rounds in Ethiopian time (EAT, UTC+3, no daylight saving).
 * Every match sync calls createDueAutoRounds(): for today and the next 2 days it
 * makes one round per time slot that has 10 matches, opens it and marks it
 * "settle automatically". Matches never mix slots, so nobody waits 12 hours.
 * The database allows one round per slot per day (0030).
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { ALL_COMPETITIONS, getSiteSettings } from "@/lib/site-settings";
import { SITE_URL } from "@/lib/site";
import { TELEGRAM_BOT_USERNAME, sendChannelMessage } from "@/lib/telegram";
import { buildRoundAnnouncement } from "@/lib/channel-post";

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

    // Today and the next 2 days, so weekend rounds are ready to play from Thursday.
    const dates = [eatDate(now), eatDate(now, 1), eatDate(now, 2)];
    const { start } = slotWindow(dates[0], "morning");
    const { end } = slotWindow(dates[dates.length - 1], "night");
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
  out.push(...(await announceOpenAutoRounds()));
  return out;
}

/**
 * Post every open automatic round that was not announced yet to the public
 * Telegram channel, once. rounds.announced_at (0041) is claimed BEFORE posting,
 * so two syncs at the same time can never post the same round twice. If the post
 * fails, the claim is undone and the next sync tries again. Test rounds (made of
 * provider "test" matches) and rounds already locked are skipped. Never throws.
 */
export async function announceOpenAutoRounds(): Promise<string[]> {
  const out: string[] = [];
  try {
    if (!process.env.TELEGRAM_BOT_TOKEN) return out;
    const admin = createAdminClient();
    const { data: rounds, error } = await admin
      .from("rounds")
      .select("id, name, auto_slot, entry_fee_units")
      .eq("status", "open")
      .not("auto_slot", "is", null)
      .is("announced_at", null)
      .order("id")
      .limit(10);
    if (error) {
      // Most likely the 0041 SQL was not run yet.
      console.error("[channel] cannot read rounds.announced_at:", error.message);
      return out;
    }
    const list = (rounds ?? []) as { id: number; name: string; auto_slot: string | null; entry_fee_units: number | null }[];
    if (list.length === 0) return out;
    const { data: ms } = await admin
      .from("matches")
      .select("round_id, kickoff_at, status, provider")
      .in("round_id", list.map((r) => r.id));
    const matches = (ms ?? []) as { round_id: number; kickoff_at: string; status: string; provider: string | null }[];

    for (const r of list) {
      const mine = matches.filter((m) => m.round_id === r.id);
      if (mine.length === 0 || mine.some((m) => m.provider === "test")) continue; // test rounds are never public
      const lockAt = mine
        .filter((m) => !["postponed", "cancelled"].includes(m.status))
        .map((m) => m.kickoff_at)
        .sort()[0];
      if (!lockAt || new Date(lockAt).getTime() <= Date.now()) continue; // too late to play

      // Claim it first: only one sync wins this update.
      const { data: claimed } = await admin
        .from("rounds")
        .update({ announced_at: new Date().toISOString() })
        .eq("id", r.id)
        .is("announced_at", null)
        .select("id");
      if ((claimed ?? []).length === 0) continue;

      const post = buildRoundAnnouncement({
        roundId: r.id,
        name: r.name,
        slot: r.auto_slot,
        matchCount: mine.length,
        lockAt,
        feeUnits: r.entry_fee_units,
        siteUrl: SITE_URL,
        botUsername: TELEGRAM_BOT_USERNAME,
      });
      const res = await sendChannelMessage(post.text, { reply_markup: post.reply_markup, disable_web_page_preview: true });
      if (res.ok) {
        out.push(`${r.name}: posted to the Telegram channel`);
      } else {
        await admin.from("rounds").update({ announced_at: null }).eq("id", r.id);
        console.error(`[channel] post failed for round ${r.id}:`, res.description);
        out.push(`${r.name}: channel post failed (${res.description ?? "unknown error"})`);
      }
    }
  } catch (e) {
    console.error("[channel] announce error:", (e as Error).message);
    out.push(`channel post error: ${(e as Error).message}`);
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
