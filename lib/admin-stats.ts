/**
 * Numbers and activity for the admin Overview (server only, secret-key client).
 */
import { createAdminClient } from "@/lib/supabase/admin";

const TZ = "Africa/Addis_Ababa";
export const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export interface ActivityItem {
  at: string;
  userId: string | null;
  username: string;
  icon: string;
  text: string;
  tone: "plus" | "minus" | "info" | "warn";
}

interface Profile {
  id: string;
  username: string;
  phone_number: string | null;
  email: string | null;
  created_at: string;
  phone_verified_at: string | null;
  balance_units: number;
  is_admin: boolean;
}
interface Ledger {
  user_id: string;
  amount_units: number;
  kind: string;
  round_id: number | null;
  league_id: number | null;
  reference: string | null;
  created_at: string;
}

export async function getOverview() {
  const admin = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();

  const [
    { data: profilesData },
    { data: ledgerData },
    { data: rounds },
    { data: leagues },
    { data: withdrawals },
    { data: entries },
    { data: leagueMembers },
    { count: predictionCount },
    { data: logins },
  ] = await Promise.all([
    admin.from("profiles").select("id, username, phone_number, email, created_at, phone_verified_at, balance_units, is_admin").limit(10000),
    admin.from("wallet_ledger").select("user_id, amount_units, kind, round_id, league_id, reference, created_at").order("created_at", { ascending: false }).limit(20000),
    admin.from("rounds").select("id, name, status, created_at"),
    admin.from("leagues").select("id, name, status, entry_fee_units"),
    admin.from("withdrawal_requests").select("user_id, units, status, created_at, processed_at"),
    admin.from("round_entries").select("user_id, round_id, created_at").gte("created_at", since30),
    admin.from("league_members").select("league_id, user_id, status, requested_at, joined_at"),
    admin.from("predictions").select("id", { count: "exact", head: true }),
    admin.from("login_attempts").select("login_key, ip, created_at").eq("success", true).order("created_at", { ascending: false }).limit(300),
  ]);

  const profiles = ((profilesData ?? []) as Profile[]).map((p) => ({ ...p, balance_units: Number(p.balance_units) }));
  const ledger = ((ledgerData ?? []) as Ledger[]).map((l) => ({ ...l, amount_units: Number(l.amount_units) }));
  const nameOf = new Map(profiles.map((p) => [p.id, p.username]));
  const now = Date.now();
  const within = (iso: string | null, days: number) => !!iso && now - new Date(iso).getTime() <= days * 86_400_000;
  const todayKey = dayKey(new Date());

  // ---- players
  const players = {
    total: profiles.length,
    verified: profiles.filter((p) => p.phone_verified_at).length,
    today: profiles.filter((p) => dayKey(new Date(p.created_at)) === todayKey).length,
    week: profiles.filter((p) => within(p.created_at, 7)).length,
    month: profiles.filter((p) => within(p.created_at, 30)).length,
    active30: new Set([
      ...((entries ?? []) as { user_id: string }[]).map((e) => e.user_id),
      ...ledger.filter((l) => within(l.created_at, 30) && l.kind === "entry_fee").map((l) => l.user_id),
    ]).size,
    withBalance: profiles.filter((p) => p.balance_units > 0).length,
  };

  // ---- money (Units)
  const sum = (f: (l: Ledger) => boolean) => ledger.filter(f).reduce((s, l) => s + l.amount_units, 0);
  const settledRounds = new Set(((rounds ?? []) as { id: number; status: string }[]).filter((r) => r.status === "settled").map((r) => r.id));
  const settledLeagues = new Set(((leagues ?? []) as { id: number; status: string }[]).filter((l) => l.status === "settled").map((l) => l.id));
  const roundFees = -sum((l) => l.kind === "entry_fee" && !l.league_id && settledRounds.has(l.round_id ?? -1));
  const roundPaid = sum((l) => l.kind === "payout" && !l.league_id && settledRounds.has(l.round_id ?? -1));
  const leagueFees = -sum((l) => l.kind === "entry_fee" && !!l.league_id && settledLeagues.has(l.league_id));
  const leaguePaid = sum((l) => l.kind === "payout" && !!l.league_id && settledLeagues.has(l.league_id));
  const w = (withdrawals ?? []) as { units: number; status: string }[];

  const money = {
    deposited: sum((l) => l.kind === "deposit"),
    depositedToday: sum((l) => l.kind === "deposit" && dayKey(new Date(l.created_at)) === todayKey),
    depositedWeek: sum((l) => l.kind === "deposit" && within(l.created_at, 7)),
    withdrawnPaid: w.filter((x) => x.status === "paid").reduce((s, x) => s + Number(x.units), 0),
    pendingWithdrawals: w.filter((x) => x.status === "pending").length,
    pendingWithdrawUnits: w.filter((x) => x.status === "pending").reduce((s, x) => s + Number(x.units), 0),
    heldInWallets: profiles.reduce((s, p) => s + p.balance_units, 0),
    inPlay: -sum((l) => l.kind === "entry_fee" && (l.league_id ? !settledLeagues.has(l.league_id) : !settledRounds.has(l.round_id ?? -1))),
    houseRevenue: roundFees - roundPaid + (leagueFees - leaguePaid),
    houseFromRounds: roundFees - roundPaid,
    houseFromLeagues: leagueFees - leaguePaid,
    prizesPaid: roundPaid + leaguePaid,
  };

  // ---- game
  const lm = (leagueMembers ?? []) as { league_id: number; user_id: string; status: string; requested_at: string; joined_at: string | null }[];
  const game = {
    roundsOpen: ((rounds ?? []) as { status: string }[]).filter((r) => r.status === "open" || r.status === "locked").length,
    roundsSettled: settledRounds.size,
    leagues: (leagues ?? []).length,
    leagueRequests: lm.filter((m) => m.status === "pending").length,
    predictions: predictionCount ?? 0,
  };

  // ---- 30-day charts
  const days = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(now - (29 - i) * 86_400_000);
    return { key: dayKey(d), label: new Intl.DateTimeFormat("en-GB", { timeZone: TZ, day: "numeric" }).format(d), signups: 0, deposits: 0 };
  });
  const slot = new Map(days.map((d) => [d.key, d]));
  for (const p of profiles) {
    const s = slot.get(dayKey(new Date(p.created_at)));
    if (s) s.signups += 1;
  }
  for (const l of ledger) {
    if (l.kind !== "deposit") continue;
    const s = slot.get(dayKey(new Date(l.created_at)));
    if (s) s.deposits += l.amount_units;
  }

  // ---- activity feed (newest first)
  const leagueName = new Map(((leagues ?? []) as { id: number; name: string }[]).map((l) => [l.id, l.name]));
  const roundName = new Map(((rounds ?? []) as { id: number; name: string }[]).map((r) => [r.id, r.name]));
  const fmt = (u: number) => `${Math.abs(u).toLocaleString("en-US", { maximumFractionDigits: 2 })} Units (${(Math.abs(u) * 200).toLocaleString("en-US")} ETB)`;
  const items: ActivityItem[] = [];
  for (const p of profiles) {
    items.push({ at: p.created_at, userId: p.id, username: p.username, icon: "🆕", text: `registered (${p.phone_number ?? "no phone"})`, tone: "info" });
    if (p.phone_verified_at) items.push({ at: p.phone_verified_at, userId: p.id, username: p.username, icon: "📱", text: "confirmed their phone", tone: "info" });
  }
  for (const l of ledger.slice(0, 400)) {
    const where = l.league_id ? `league ${leagueName.get(l.league_id) ?? ""}` : roundName.get(l.round_id ?? -1) ?? "a round";
    const map: Record<string, [string, string, ActivityItem["tone"]]> = {
      deposit: ["💰", `deposit +${fmt(l.amount_units)}`, "plus"],
      entry_fee: ["⚽", `joined ${where} (−${fmt(l.amount_units)})`, "minus"],
      payout: ["🏆", `won ${where} +${fmt(l.amount_units)}`, "plus"],
      withdrawal: ["⏳", `requested withdrawal of ${fmt(l.amount_units)}`, "warn"],
      refund: ["↩️", `refund +${fmt(l.amount_units)}`, "plus"],
      subscription: ["⭐", `paid for Gebeta Premium ${fmt(-l.amount_units)}`, "plus"],
      adjustment: [l.amount_units > 0 ? "➕" : "➖", `${l.amount_units > 0 ? "units added" : "units deducted"} ${fmt(l.amount_units)}`, l.amount_units > 0 ? "plus" : "minus"],
    };
    const m = map[l.kind];
    if (m) items.push({ at: l.created_at, userId: l.user_id, username: nameOf.get(l.user_id) ?? "?", icon: m[0], text: m[1], tone: m[2] });
  }
  for (const m of lm) {
    if (m.status === "pending") {
      items.push({ at: m.requested_at, userId: m.user_id, username: nameOf.get(m.user_id) ?? "?", icon: "🔔", text: `asked to join league ${leagueName.get(m.league_id) ?? ""}`, tone: "warn" });
    }
  }
  // logins: key is phone / username / email
  const byKey = new Map<string, Profile>();
  for (const p of profiles) {
    if (p.phone_number) byKey.set(p.phone_number, p);
    byKey.set(p.username.toLowerCase(), p);
    if (p.email) byKey.set(p.email.toLowerCase(), p);
  }
  for (const l of (logins ?? []) as { login_key: string; created_at: string }[]) {
    const p = byKey.get(l.login_key);
    items.push({ at: l.created_at, userId: p?.id ?? null, username: p?.username ?? l.login_key, icon: "🔑", text: "logged in", tone: "info" });
  }
  items.sort((a, b) => b.at.localeCompare(a.at));

  const newest = [...profiles].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);

  return { players, money, game, days, activity: items.slice(0, 60), newest };
}
