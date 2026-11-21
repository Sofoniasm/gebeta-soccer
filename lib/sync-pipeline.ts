/**
 * The whole match-sync job (scores, settling, auto rounds, renewals, digest). Used by the cron endpoint
 * (/api/sync-matches) and by the on-demand kick (/api/sync-kick).
 */
import { syncMatches } from "@/lib/football/sync";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushNotifications } from "@/lib/notify";
import { settleDueRounds } from "@/lib/round-settle";
import { createDueAutoRounds } from "@/lib/auto-rounds";
import { sendWithdrawalDigest } from "@/lib/withdrawal-digest";

export async function runSyncPipeline(opts: { competitions?: string[]; daysBack?: number; daysAhead?: number } = {}) {
  const result = await syncMatches(opts);
    // Private challenges whose matches are over get paid (or refunded) right away.
    const { data: settled } = await createAdminClient().rpc("settle_due_challenges");
    // Quiz Royale rooms that finished (or never started) are paid or refunded too.
    const { data: royaleSettled } = await createAdminClient().rpc("settle_due_royale");
    // Survivor pools: finished match days are resolved, the next day opens, pots are paid.
    const { data: survivorSettled } = await createAdminClient().rpc("settle_due_survivor");
    // Gebeta games: unjoined ones are refunded, a player who ran out of time loses.
    const { data: gebetaSettled } = await createAdminClient().rpc("settle_due_gebeta");
    // Dama games: same clean-up.
    const { data: damaSettled } = await createAdminClient().rpc("settle_due_dama");
    // Chess games: same clean-up.
    const { data: chessSettled } = await createAdminClient().rpc("settle_due_chess");
    // Rounds marked "settle automatically" whose matches are all over get paid too.
    let roundsSettled: string[] = [];
    try {
      roundsSettled = await settleDueRounds();
    } catch (e) {
      roundsSettled = [`round settle error: ${(e as Error).message}`];
    }
    if (Number(settled) > 0 || Number(royaleSettled) > 0 || Number(survivorSettled) > 0 || Number(gebetaSettled) > 0 || Number(damaSettled) > 0 || Number(chessSettled) > 0 || roundsSettled.length > 0) await pushNotifications();
    // Morning / Evening / Night rounds (EAT) open by themselves when a slot has 10 matches.
    const autoRounds = await createDueAutoRounds();
    // Gebeta Premium renewals (from the wallet; ends quietly when there aren't enough Units).
    let premiumRenewed = 0;
    try {
      const { data: n } = await createAdminClient().rpc("renew_due_subscriptions");
      premiumRenewed = Number(n ?? 0);
      await pushNotifications();
    } catch {
      /* 0031 not run yet */
    }
    // Daily message to the admins: withdrawals waiting to be paid.
    let withdrawalDigest = "";
    try {
      withdrawalDigest = await sendWithdrawalDigest();
    } catch (e) {
      withdrawalDigest = `digest error: ${(e as Error).message}`;
    }
  await createAdminClient().rpc("sync_mark_ran");
  return { body: { ...result, challengesSettled: Number(settled ?? 0), roundsSettled, autoRounds, premiumRenewed, withdrawalDigest }, status: result.ok ? 200 : 207 };
}
