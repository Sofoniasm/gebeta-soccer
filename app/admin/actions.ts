"use server";

/**
 * Admin-only server actions. Every action first checks the caller is an
 * admin (profiles.is_admin), then uses the secret-key client.
 * Results are shown via ?msg= / ?err= on /admin.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMatches } from "@/lib/football/sync";
import { settleRound } from "@/lib/settlement";
import { formatUnits } from "@/lib/money";

async function requireAdmin(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) redirect("/dashboard");
  return user.id;
}

function done(kind: "msg" | "err", text: string, extra = ""): never {
  revalidatePath("/admin");
  revalidatePath("/dashboard");
  revalidatePath("/");
  redirect(`/admin?${kind}=${encodeURIComponent(text)}${extra}`);
}

// ------------------------------------------------------------ wallets
/** Manual Telegram deposit / deduction: 1–50 units per transaction. */
export async function adjustUnits(formData: FormData) {
  const adminId = await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const op = String(formData.get("op") ?? "add");
  const units = Number(formData.get("units"));
  const note = String(formData.get("note") ?? "").trim();
  const q = String(formData.get("q") ?? "");
  const back = q ? `&q=${encodeURIComponent(q)}` : "";

  if (!userId) done("err", "No player selected.", back);
  if (!Number.isFinite(units) || units <= 0 || units > 50) done("err", "Enter between 1 and 50 units.", back);

  const reference = note ? `Manual Telegram Adjustment — ${note}` : "Manual Telegram Adjustment";
  const { error } = await createAdminClient().rpc(op === "deduct" ? "admin_deduct_units" : "admin_add_units", {
    p_user_id: userId,
    p_units: units,
    p_reference: reference,
    p_admin_id: adminId,
  });
  if (error) {
    done("err", error.message.includes("insufficient") ? "Player doesn't have that many units." : error.message, back);
  }
  done("msg", op === "deduct" ? `Deducted ${formatUnits(units)}.` : `Added ${formatUnits(units)}.`, back);
}

// ------------------------------------------------------------ matches
export async function syncNow() {
  await requireAdmin();
  try {
    const r = await syncMatches({ daysBack: 3, daysAhead: 7 });
    if (!r.ok) done("err", `Sync finished with errors: ${r.errors.join(" | ")}`);
    done("msg", `Synced ${r.upserted} matches (${r.competitions.join(", ")}, ${r.window.dateFrom} → ${r.window.dateTo}).`);
  } catch (e) {
    // redirect() throws internally — let it through.
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    done("err", (e as Error).message);
  }
}

// ------------------------------------------------------------- rounds
export async function createRound(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const fee = Number(formData.get("entryFee") ?? 1);
  if (!name) done("err", "Give the round a name, e.g. “Week 12”.");
  if (!Number.isFinite(fee) || fee <= 0) done("err", "Entry fee must be positive.");

  const { error } = await createAdminClient()
    .from("rounds")
    .insert({ name, entry_fee_units: fee, status: "open" });
  if (error) done("err", error.message);
  done("msg", `Round “${name}” created and open.`);
}

export async function setRoundStatus(formData: FormData) {
  await requireAdmin();
  const roundId = Number(formData.get("roundId"));
  const status = String(formData.get("status"));
  if (!["open", "locked", "cancelled"].includes(status)) done("err", "Invalid status.");
  if (status === "cancelled") done("err", "Cancelling (with refunds) isn’t supported yet.");

  const { error } = await createAdminClient()
    .from("rounds")
    .update({ status })
    .eq("id", roundId)
    .in("status", ["open", "locked"]);
  if (error) done("err", error.message);
  done("msg", `Round is now ${status}.`);
}

export async function assignMatches(formData: FormData) {
  await requireAdmin();
  const roundId = Number(formData.get("roundId"));
  const ids = formData.getAll("matchId").map(Number).filter(Number.isFinite);
  if (ids.length === 0) done("err", "Tick at least one match.");

  const { error } = await createAdminClient()
    .from("matches")
    .update({ round_id: roundId })
    .in("id", ids)
    .is("round_id", null);
  if (error) done("err", error.message);
  done("msg", `Added ${ids.length} match${ids.length === 1 ? "" : "es"} to the round.`);
}

export async function removeMatch(formData: FormData) {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  const admin = createAdminClient();

  const { count } = await admin.from("predictions").select("id", { count: "exact", head: true }).eq("match_id", matchId);
  if ((count ?? 0) > 0) done("err", "Players already predicted this match — it can’t be removed.");

  const { error } = await admin.from("matches").update({ round_id: null }).eq("id", matchId);
  if (error) done("err", error.message);
  done("msg", "Match removed from round.");
}

/** Manually set / correct a final score (if the API is late or wrong). */
export async function setScore(formData: FormData) {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  const home = Number(formData.get("home"));
  const away = Number(formData.get("away"));
  const status = String(formData.get("status") ?? "finished");

  if (status === "finished" && (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)) {
    done("err", "Enter both scores as whole numbers.");
  }

  const { error } = await createAdminClient()
    .from("matches")
    .update(
      status === "finished"
        ? { status, actual_home_score: home, actual_away_score: away, updated_at: new Date().toISOString() }
        : { status, actual_home_score: null, actual_away_score: null, updated_at: new Date().toISOString() }
    )
    .eq("id", matchId);
  if (error) done("err", error.message);
  done("msg", status === "finished" ? `Score saved: ${home} – ${away}.` : `Match marked ${status}.`);
}

// ------------------------------------------------------------ settle
export async function settle(formData: FormData) {
  const adminId = await requireAdmin();
  const roundId = Number(formData.get("roundId"));
  const admin = createAdminClient();

  const { data: round } = await admin.from("rounds").select("*").eq("id", roundId).single();
  if (!round) done("err", "Round not found.");

  const { data: matches } = await admin.from("matches").select("*").eq("round_id", roundId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = any;
  const list: Row[] = matches ?? [];
  if (list.length === 0) done("err", "This round has no matches.");
  const unfinished = list.filter((m: Row) => !["finished", "cancelled", "postponed"].includes(m.status));
  if (unfinished.length > 0) done("err", `${unfinished.length} match(es) not finished yet. Sync or enter scores first.`);
  const missing = list.filter((m: Row) => m.status === "finished" && (m.actual_home_score === null || m.actual_away_score === null));
  if (missing.length > 0) done("err", `${missing.length} finished match(es) have no score. Enter them first.`);

  const { data: entries } = await admin.from("round_entries").select("user_id").eq("round_id", roundId);
  const { data: preds } = await admin
    .from("predictions")
    .select("id, user_id, match_id, predicted_home_score, predicted_away_score")
    .in("match_id", list.map((m: Row) => m.id));

  const result = settleRound({
    entrantIds: (entries ?? []).map((e: Row) => e.user_id as string),
    entryFeeUnits: Number(round.entry_fee_units),
    houseCut: Number(round.house_cut),
    results: list
      .filter((m: Row) => m.status === "finished")
      .map((m: Row) => ({ matchId: m.id, homeScore: m.actual_home_score, awayScore: m.actual_away_score })),
    predictions: (preds ?? []).map((p: Row) => ({
      predictionId: p.id,
      userId: p.user_id,
      matchId: p.match_id,
      predictedHome: p.predicted_home_score,
      predictedAway: p.predicted_away_score,
    })),
  });

  const { error } = await admin.rpc("settle_round", {
    p_round_id: roundId,
    p_points: result.pointsByPrediction.map((p) => ({ prediction_id: p.predictionId, points: p.points })),
    p_payouts: result.payouts.map((p) => ({ user_id: p.userId, units: p.units })),
    p_admin_id: adminId,
  });
  if (error) done("err", error.message);

  const winners = result.payouts.length;
  const paid = result.payouts.reduce((sum, p) => sum + p.units, 0);
  done(
    "msg",
    `Round settled. Pool ${formatUnits(result.poolUnits)}, paid ${winners} winner${winners === 1 ? "" : "s"} ${formatUnits(paid)}, house ${formatUnits(result.houseUnits)}.`
  );
}

// ------------------------------------------------- withdrawal requests
export async function markWithdrawalPaid(formData: FormData) {
  const adminId = await requireAdmin();
  const id = Number(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await createAdminClient().rpc("admin_mark_withdrawal_paid", { p_request_id: id, p_note: note, p_admin_id: adminId });
  if (error) done("err", error.message);
  done("msg", `Withdrawal #${id} marked as paid.`);
}

export async function rejectWithdrawal(formData: FormData) {
  const adminId = await requireAdmin();
  const id = Number(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim() || "Rejected";
  const { error } = await createAdminClient().rpc("admin_reject_withdrawal", { p_request_id: id, p_note: note, p_admin_id: adminId });
  if (error) done("err", error.message);
  done("msg", `Withdrawal #${id} rejected and units refunded.`);
}
