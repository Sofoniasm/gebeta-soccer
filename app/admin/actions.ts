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
import { createDueAutoRounds } from "@/lib/auto-rounds";
import { settleDueRounds, settleRoundNow } from "@/lib/round-settle";
import { createResetCode, deliverResetCode } from "@/lib/password-reset";

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
      if (u.pathname.startsWith("/admin")) {
        path = u.pathname;
        const r = u.searchParams.get("round");
        if (r && !extra.includes("round=")) extra += `&round=${encodeURIComponent(r)}`;
      }
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
/** Pay out / refund private challenges, and settle auto-settle rounds, whose matches are over. Never blocks the caller. */
async function settleChallenges() {
  try {
    const { data } = await createAdminClient().rpc("settle_due_challenges");
    const rounds = await settleDueRounds();
    if (Number(data) > 0 || rounds.length > 0) await pushNotifications();
  } catch (e) {
    console.error("settle due:", (e as Error).message);
  }
}

export async function syncNow() {
  await requireAdmin();
  try {
    const r = await syncMatches({ daysBack: 1, daysAhead: 9 });
    await settleChallenges();
    const auto = await createDueAutoRounds();
    const autoNote = auto.length ? ` Automatic rounds: ${auto.join("; ")}.` : "";
    if (!r.ok) return done("err", `Sync finished with errors: ${r.errors.join(" | ")}${autoNote}`);
    return done("msg", `Synced ${r.upserted} matches (${r.competitions.join(", ")}, ${r.window.dateFrom} → ${r.window.dateTo}).${autoNote}`);
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
  if (!name) return done("err", "Give the round a name, e.g. “Today's 10”.");
  if (!Number.isFinite(fee) || fee <= 0) return done("err", "Entry fee must be positive.");

  const autoSettle = formData.get("autoSettle") === "on";
  const { data, error } = await createAdminClient()
    .from("rounds")
    .insert({ name, entry_fee_units: fee, status: "draft", auto_settle: autoSettle })
    .select("id")
    .single();
  if (error) return done("err", error.message.includes("auto_settle") ? "Run the 0024 SQL first (daily rounds)." : error.message);
  return done("msg", `Round “${name}” created as a draft. Add exactly 10 matches, then open it for players.`, `&round=${data.id}`);
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
  const r = await settleRoundNow(Number(formData.get("roundId")), adminId);
  if (r.ok) await pushNotifications();
  return done(r.ok ? "msg" : "err", r.message);
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

// ------------------------------------------------------------ player photos
/** Take down a player's profile picture (e.g. not suitable). */
export async function removePlayerPhoto(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const admin = createAdminClient();
  const { data } = await admin.from("profiles").select("avatar_url").eq("id", userId).maybeSingle();
  await admin.from("profiles").update({ avatar_url: null }).eq("id", userId);
  const m = data?.avatar_url?.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/);
  if (m) await admin.storage.from("avatars").remove([decodeURIComponent(m[1])]);
  return done("msg", "Photo removed.");
}

/** Turn automatic settling on or off for a round. */
export async function setAutoSettle(formData: FormData) {
  await requireAdmin();
  const roundId = Number(formData.get("roundId"));
  const on = formData.get("on") === "1";
  const { error } = await createAdminClient().from("rounds").update({ auto_settle: on }).eq("id", roundId);
  if (error) return done("err", error.message);
  return done("msg", on ? "This round will settle by itself when its last match ends." : "Automatic settling turned off. Settle it with the button.");
}

// ------------------------------------------------------------ password reset
/** Send the player a 6-digit reset code on their Telegram (or SMS). */
export async function sendPlayerResetLink(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const r = await deliverResetCode(userId, null);
  return done(
    r.via ? "msg" : "err",
    r.via
      ? `Reset code sent by ${r.via === "telegram" ? "Telegram" : "SMS"}. The player enters it at Log in → Forgot password? (valid 10 minutes).`
      : `Could not send the code (${r.error}). Use “Create a code for the player” and tell it to them yourself.`,
  );
}

/** For a player who can't get Telegram: create a code to tell them (after checking it's really them). */
export async function showPlayerResetLink(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") ?? "");
  const { code, id } = await createResetCode(userId, "admin", null);
  await createAdminClient().from("password_resets").update({ delivered: "shown_to_admin" }).eq("id", id);
  return done("msg", `Reset code ${code} (valid 10 minutes, one use). Only tell it to the player after checking it's really them. They enter it at Log in → Forgot password?, with their phone number.`);
}
