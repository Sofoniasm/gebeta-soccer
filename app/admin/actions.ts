"use server";

/**
 * Admin-only server actions. Every action first checks the caller is an
 * admin (profiles.is_admin), then uses the secret-key client.
 * Results are shown via ?msg= / ?err= on /admin.
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncMatches } from "@/lib/football/sync";
import { formatUnits } from "@/lib/money";
import { pushNotifications } from "@/lib/notify";
import { settleLeague } from "@/lib/league-settle";
import { computeSlipSettlement } from "@/lib/slip-settle";

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

async function done(kind: "msg" | "err", text: string, extra = ""): Promise<never> {
  // Go back to whichever admin page the button was on (Rounds, Players, …).
  let path = "/admin";
  try {
    const ref = (await headers()).get("referer");
    if (ref) {
      const u = new URL(ref);
      if (u.pathname.startsWith("/admin")) path = u.pathname;
    }
  } catch {
    /* keep default */
  }
  revalidatePath("/admin", "layout");
  revalidatePath("/dashboard");
  revalidatePath("/leaderboard");
  revalidatePath("/wallet");
  revalidatePath("/");
  redirect(`${path}?${kind}=${encodeURIComponent(text)}${extra}`);
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

  if (!userId) return done("err", "No player selected.", back);
  if (!Number.isFinite(units) || units <= 0 || units > 50) return done("err", "Enter between 1 and 50 units.", back);

  const reference = note ? `Manual Telegram Adjustment — ${note}` : "Manual Telegram Adjustment";
  const { error } = await createAdminClient().rpc(op === "deduct" ? "admin_deduct_units" : "admin_add_units", {
    p_user_id: userId,
    p_units: units,
    p_reference: reference,
    p_admin_id: adminId,
  });
  if (error) {
    return done("err", error.message.includes("insufficient") ? "Player doesn't have that many units." : error.message, back);
  }
  await pushNotifications([userId]);
  return done("msg", op === "deduct" ? `Deducted ${formatUnits(units)}.` : `Added ${formatUnits(units)}.`, back);
}

// ------------------------------------------------------- login lock
/** Clear a player's wrong-password lock (phone, username and email logins). */
export async function unlockLogin(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const q = String(formData.get("q") ?? "");
  const back = q ? `&q=${encodeURIComponent(q)}` : "";
  if (!userId) return done("err", "No player selected.", back);

  const admin = createAdminClient();
  const { data: p } = await admin.from("profiles").select("username, phone_number, email").eq("id", userId).single();
  if (!p) return done("err", "Player not found.", back);
  const keys = [p.phone_number, p.username?.toLowerCase(), p.email?.toLowerCase()].filter(Boolean) as string[];
  for (const key of keys) {
    const { error } = await admin.rpc("clear_login_lock", { p_key: key });
    if (error) return done("err", error.message, back);
  }
  return done("msg", `Login unlocked for ${p.username}.`, back);
}

// ------------------------------------------------------------ matches
/** Pay out / refund private challenges whose matches are over. Never blocks the caller. */
async function settleChallenges() {
  try {
    const { data } = await createAdminClient().rpc("settle_due_challenges");
    if (Number(data) > 0) await pushNotifications();
  } catch (e) {
    console.error("settle_due_challenges:", (e as Error).message);
  }
}

export async function syncNow() {
  await requireAdmin();
  try {
    const r = await syncMatches({ daysBack: 3, daysAhead: 7 });
    await settleChallenges();
    if (!r.ok) return done("err", `Sync finished with errors: ${r.errors.join(" | ")}`);
    return done("msg", `Synced ${r.upserted} matches (${r.competitions.join(", ")}, ${r.window.dateFrom} → ${r.window.dateTo}).`);
  } catch (e) {
    // redirect() throws internally — let it through.
    if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
    return done("err", (e as Error).message);
  }
}

// ------------------------------------------------------------- rounds
export async function createRound(formData: FormData) {
  await requireAdmin();
  const name = String(formData.get("name") ?? "").trim();
  const fee = Number(formData.get("entryFee") ?? 1);
  if (!name) return done("err", "Give the round a name, e.g. “Week 12”.");
  if (!Number.isFinite(fee) || fee <= 0) return done("err", "Entry fee must be positive.");

  const { error } = await createAdminClient()
    .from("rounds")
    .insert({ name, entry_fee_units: fee, status: "draft" });
  if (error) return done("err", error.message);
  return done("msg", `Round “${name}” created as a draft. Add exactly 10 matches, then open it for players.`);
}

export async function setRoundStatus(formData: FormData) {
  await requireAdmin();
  const roundId = Number(formData.get("roundId"));
  const status = String(formData.get("status"));
  if (!["open", "locked", "cancelled"].includes(status)) return done("err", "Invalid status.");
  if (status === "cancelled") return done("err", "Cancelling (with refunds) isn’t supported yet.");

  const { error } = await createAdminClient()
    .from("rounds")
    .update({ status })
    .eq("id", roundId)
    .in("status", ["draft", "open", "locked"]);
  if (error) {
    const m = error.message.match(/needs exactly 10 matches to open \(it has (\d+)\)/);
    return done("err", m ? `A round needs exactly 10 matches to open — this one has ${m[1]}.` : error.message);
  }
  return done("msg", status === "open" ? "Round is open — players can now join and predict." : `Round is now ${status}.`);
}

export async function assignMatches(formData: FormData) {
  await requireAdmin();
  const roundId = Number(formData.get("roundId"));
  const ids = formData.getAll("matchId").map(Number).filter(Number.isFinite);
  if (ids.length === 0) return done("err", "Tick at least one match.");

  const { count } = await createAdminClient().from("matches").select("id", { count: "exact", head: true }).eq("round_id", roundId);
  const room = 10 - (count ?? 0);
  if (ids.length > room) {
    return done("err", room <= 0 ? "This round already has 10 matches." : `A round has exactly 10 matches — you can add ${room} more (you ticked ${ids.length}).`);
  }

  const { error } = await createAdminClient()
    .from("matches")
    .update({ round_id: roundId })
    .in("id", ids)
    .is("round_id", null)
    .eq("status", "scheduled")
    .gt("kickoff_at", new Date().toISOString());
  if (error) return done("err", error.message);
  return done("msg", `Added ${ids.length} match${ids.length === 1 ? "" : "es"} to the round.`);
}

export async function removeMatch(formData: FormData) {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  const admin = createAdminClient();

  const { count } = await admin.from("predictions").select("id", { count: "exact", head: true }).eq("match_id", matchId);
  if ((count ?? 0) > 0) return done("err", "Players already predicted this match — it can’t be removed.");

  const { error } = await admin.from("matches").update({ round_id: null }).eq("id", matchId);
  if (error) return done("err", error.message);
  return done("msg", "Match removed from round.");
}

/** Manually set / correct a final score (if the API is late or wrong). */
export async function setScore(formData: FormData) {
  await requireAdmin();
  const matchId = Number(formData.get("matchId"));
  const home = Number(formData.get("home"));
  const away = Number(formData.get("away"));
  const status = String(formData.get("status") ?? "finished");

  if (status === "finished" && (!Number.isInteger(home) || !Number.isInteger(away) || home < 0 || away < 0)) {
    return done("err", "Enter both scores as whole numbers.");
  }

  const { error } = await createAdminClient()
    .from("matches")
    .update(
      status === "finished"
        ? { status, actual_home_score: home, actual_away_score: away, updated_at: new Date().toISOString() }
        : { status, actual_home_score: null, actual_away_score: null, updated_at: new Date().toISOString() }
    )
    .eq("id", matchId);
  if (error) return done("err", error.message);
  await settleChallenges();
  return done("msg", status === "finished" ? `Score saved: ${home} – ${away}.` : `Match marked ${status}.`);
}

// ------------------------------------------------------------ settle
export async function settle(formData: FormData) {
  const adminId = await requireAdmin();
  const roundId = Number(formData.get("roundId"));
  const admin = createAdminClient();

  const { data: round } = await admin.from("rounds").select("*").eq("id", roundId).single();
  if (!round) return done("err", "Round not found.");

  const { data: matches } = await admin.from("matches").select("*").eq("round_id", roundId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Row = any;
  const list: Row[] = matches ?? [];
  if (list.length === 0) return done("err", "This round has no matches.");
  const unfinished = list.filter((m: Row) => !["finished", "cancelled", "postponed"].includes(m.status));
  if (unfinished.length > 0) return done("err", `${unfinished.length} match(es) not finished yet. Sync or enter scores first.`);
  const missing = list.filter((m: Row) => m.status === "finished" && (m.actual_home_score === null || m.actual_away_score === null));
  if (missing.length > 0) return done("err", `${missing.length} finished match(es) have no score. Enter them first.`);

  // Every slip is an entrant (slips are always complete, so no default picks needed).
  const { result, slipById, payouts } = await computeSlipSettlement(admin, round);

  const { error } = await admin.rpc("settle_round_slips", {
    p_round_id: roundId,
    p_points: result.pointsByPrediction.map((p) => ({ pick_id: p.predictionId, points: p.points })),
    p_slams: result.slams.map((x) => ({ slip_id: Number(x.userId), slam_points: x.slamPoints })),
    p_payouts: payouts.map((p) => ({ slip_id: p.slip.id, units: p.units, rank: p.rank })),
    p_admin_id: adminId,
  });
  if (error) return done("err", error.message);

  // Every slip that didn't win gets its result; winners already got "You won!" from the wallet.
  const winningSlips = new Set(payouts.map((p) => String(p.slip.id)));
  const total = result.standings.length;
  const roundName = (round.name as string) || `Round ${roundId}`;
  const barNote = result.barMet ? "" : ` Nobody scored more than ${result.winningBar} match points, so there is no winner this round.`;
  const notes = result.standings
    .filter((s) => !winningSlips.has(s.userId))
    .map((s) => {
      const slip = slipById.get(s.userId)!;
      return {
        user_id: slip.user_id,
        kind: "round_result",
        title: `📊 ${roundName} results`,
        body: `Slip #${slip.slip_no} finished #${s.rank} of ${total} with ${s.totalPoints} points (${s.matchPoints} match points, ${s.exactScores} exact, ${s.correctResults} correct).${barNote || " Better luck next round!"}`,
        link: "/results",
      };
    });
  if (notes.length) await admin.from("notifications").insert(notes);

  // Private leagues on this round are settled in the same click.
  const { data: openLeagues } = await admin.from("leagues").select("id").eq("round_id", roundId).eq("status", "open");
  const leagueMsgs: string[] = [];
  for (const l of (openLeagues ?? []) as { id: number }[]) {
    const r = await settleLeague(l.id, adminId);
    leagueMsgs.push(r.message);
  }

  await pushNotifications();

  const winners = payouts.length;
  const paid = payouts.reduce((sum, p) => sum + p.units, 0);
  return done(
    "msg",
    (result.barMet
      ? `Round settled. Pool ${formatUnits(result.poolUnits)}, paid ${winners} winning slip${winners === 1 ? "" : "s"} ${formatUnits(paid)}, house ${formatUnits(result.houseUnits)}.`
      : `Round settled with no winner (best slip ${result.topMatchPoints}, bar more than ${result.winningBar}). House keeps the pool: ${formatUnits(result.houseUnits)}.`) +
      (leagueMsgs.length ? ` Leagues: ${leagueMsgs.join(" ")}` : "")
  );
}

// ------------------------------------------------- withdrawal requests
export async function markWithdrawalPaid(formData: FormData) {
  const adminId = await requireAdmin();
  const id = Number(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim() || null;
  const { error } = await createAdminClient().rpc("admin_mark_withdrawal_paid", { p_request_id: id, p_note: note, p_admin_id: adminId });
  if (error) return done("err", error.message);
  await pushNotifications();
  return done("msg", `Withdrawal #${id} marked as paid.`);
}

export async function rejectWithdrawal(formData: FormData) {
  const adminId = await requireAdmin();
  const id = Number(formData.get("requestId"));
  const note = String(formData.get("note") ?? "").trim() || "Rejected";
  const { error } = await createAdminClient().rpc("admin_reject_withdrawal", { p_request_id: id, p_note: note, p_admin_id: adminId });
  if (error) return done("err", error.message);
  await pushNotifications();
  return done("msg", `Withdrawal #${id} rejected and units refunded.`);
}

// ------------------------------------------------------ private leagues
export async function approveLeagueMember(formData: FormData) {
  const adminId = await requireAdmin();
  const leagueId = Number(formData.get("leagueId"));
  const userId = String(formData.get("userId") ?? "");
  const addUnits = formData.get("mode") === "add";
  const { error } = await createAdminClient().rpc("admin_approve_league_member", {
    p_league_id: leagueId,
    p_user_id: userId,
    p_add_units: addUnits,
    p_admin_id: adminId,
  });
  if (error) {
    return done("err", error.message.includes("insufficient") ? "Player doesn't have enough units — use “Received ETB: add & approve”." : error.message);
  }
  await pushNotifications([userId]);
  return done("msg", addUnits ? "Units added and player approved." : "Approved — entry fee taken from the player's wallet.");
}

export async function rejectLeagueMember(formData: FormData) {
  const adminId = await requireAdmin();
  const leagueId = Number(formData.get("leagueId"));
  const userId = String(formData.get("userId") ?? "");
  const { error } = await createAdminClient().rpc("admin_reject_league_member", {
    p_league_id: leagueId,
    p_user_id: userId,
    p_admin_id: adminId,
  });
  if (error) return done("err", error.message);
  await pushNotifications([userId]);
  return done("msg", "Request declined.");
}

export async function settleLeagueNow(formData: FormData) {
  const adminId = await requireAdmin();
  const r = await settleLeague(Number(formData.get("leagueId")), adminId);
  await pushNotifications();
  return done(r.ok ? "msg" : "err", r.message);
}
