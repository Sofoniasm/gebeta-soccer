/**
 * Fraud Watch rules (pure, no database). Simple, explainable signals for the
 * admin to review. A flag is a reason to look, never proof: many Ethiopian
 * mobile users share one carrier IP, and family members may share a phone.
 */
import { normalizeEthiopianPhone } from "@/lib/phone";

export type Severity = "high" | "medium" | "low";

export interface FProfile { id: string; username: string; phone_number: string | null; created_at: string; is_admin?: boolean | null }
export interface FLedger { user_id: string; kind: string; amount_units: number; created_at: string }
export interface FWithdrawal { user_id: string; units: number; payout_phone: string; status: string; created_at: string }
export interface FLogin { login_key: string; ip: string; created_at: string }

export interface Flag { rule: string; severity: Severity; reason: string; related: string[] }
export interface Flagged { user: FProfile; flags: Flag[]; score: number; facts: { deposits: number; bonuses: number; played: number; won: number; withdrawn: number } }

const WEIGHT: Record<Severity, number> = { high: 10, medium: 4, low: 1 };
const HOUR = 3600_000;
const phoneKey = (p: string | null | undefined) => (p ? normalizeEthiopianPhone(p) ?? p.replace(/\D/g, "") : null);
const u = (n: number) => `${Math.round(n * 100) / 100} Units`;

export const RULES = {
  sharedPayout: "Same payout number on several accounts",
  payoutIsOtherPlayer: "Cashes out to another player's phone",
  noPlay: "Money in and out without playing",
  lowPlay: "Plays very little before cashing out",
  newAccountCashout: "Brand-new account cashing out",
  sharedNetwork: "Many accounts on one network (IP)",
} as const;

export function detectFraud(input: {
  profiles: FProfile[];
  ledger: FLedger[];
  withdrawals: FWithdrawal[];
  logins: FLogin[];
  /** Accounts sharing one IP before it counts (carrier IPs are shared a lot). */
  ipThreshold?: number;
}): Flagged[] {
  const ipThreshold = input.ipThreshold ?? 3;
  const byId = new Map(input.profiles.map((p) => [p.id, p]));
  const name = (id: string) => byId.get(id)?.username ?? "unknown";
  const flags = new Map<string, Flag[]>();
  const add = (id: string, f: Flag) => {
    if (!byId.has(id) || byId.get(id)!.is_admin) return;
    flags.set(id, [...(flags.get(id) ?? []), f]);
  };

  // Money per player.
  const facts = new Map<string, Flagged["facts"]>();
  const factOf = (id: string) => facts.get(id) ?? (facts.set(id, { deposits: 0, bonuses: 0, played: 0, won: 0, withdrawn: 0 }), facts.get(id)!);
  const firstMoneyIn = new Map<string, number>();
  for (const l of input.ledger) {
    const f = factOf(l.user_id);
    const amt = Number(l.amount_units);
    if (l.kind === "deposit") f.deposits += amt;
    else if (l.kind === "adjustment" && amt > 0) f.bonuses += amt;
    else if (l.kind === "entry_fee" || l.kind === "subscription") f.played += Math.abs(amt);
    else if (l.kind === "payout") f.won += amt;
    if ((l.kind === "deposit" || (l.kind === "adjustment" && amt > 0))) {
      const t = Date.parse(l.created_at);
      if (!firstMoneyIn.has(l.user_id) || t < firstMoneyIn.get(l.user_id)!) firstMoneyIn.set(l.user_id, t);
    }
  }
  const live = input.withdrawals.filter((w) => w.status !== "rejected");
  for (const w of live) factOf(w.user_id).withdrawn += Number(w.units);

  // 1. One payout number used by several accounts.
  const usersByPayout = new Map<string, Set<string>>();
  for (const w of live) {
    const k = phoneKey(w.payout_phone);
    if (!k) continue;
    usersByPayout.set(k, (usersByPayout.get(k) ?? new Set()).add(w.user_id));
  }
  for (const [num, ids] of usersByPayout) {
    if (ids.size < 2) continue;
    for (const id of ids) {
      const others = [...ids].filter((x) => x !== id);
      add(id, { rule: RULES.sharedPayout, severity: "high", reason: `Payout number ${num} is also used by ${others.map(name).join(", ")}.`, related: others });
    }
  }

  // 2. Payout number is another player's registered phone.
  const ownerByPhone = new Map<string, string>();
  for (const p of input.profiles) {
    const k = phoneKey(p.phone_number);
    if (k) ownerByPhone.set(k, p.id);
  }
  const seenPair = new Set<string>();
  for (const w of live) {
    const owner = ownerByPhone.get(phoneKey(w.payout_phone) ?? "");
    if (!owner || owner === w.user_id || seenPair.has(w.user_id + owner)) continue;
    seenPair.add(w.user_id + owner);
    add(w.user_id, { rule: RULES.payoutIsOtherPlayer, severity: "high", reason: `Asked to be paid to ${phoneKey(w.payout_phone)}, which is ${name(owner)}'s phone.`, related: [owner] });
  }

  // 3/4/5. Cash-out patterns.
  const withdrawers = new Set(live.map((w) => w.user_id));
  for (const id of withdrawers) {
    const f = factOf(id);
    const moneyIn = f.deposits + f.bonuses;
    if (moneyIn > 0 && f.played === 0) {
      add(id, { rule: RULES.noPlay, severity: "high", reason: `Put in ${u(moneyIn)}${f.bonuses ? ` (${u(f.bonuses)} of it bonus)` : ""} and asked to withdraw ${u(f.withdrawn)} without ever playing.`, related: [] });
    } else if (moneyIn >= 2 && f.played < moneyIn * 0.2) {
      add(id, { rule: RULES.lowPlay, severity: "medium", reason: `Played only ${u(f.played)} of ${u(moneyIn)} put in before withdrawing ${u(f.withdrawn)}.`, related: [] });
    }
    const p = byId.get(id);
    const firstW = Math.min(...live.filter((w) => w.user_id === id).map((w) => Date.parse(w.created_at)));
    if (p && firstW - Date.parse(p.created_at) < 72 * HOUR) {
      const hours = Math.max(0, Math.round((firstW - Date.parse(p.created_at)) / HOUR));
      add(id, { rule: RULES.newAccountCashout, severity: "medium", reason: `Asked for a withdrawal ${hours < 1 ? "less than an hour" : `${hours} hour${hours === 1 ? "" : "s"}`} after signing up.`, related: [] });
    }
  }

  // 6. Many accounts logging in from one IP.
  const userByKey = new Map<string, string>();
  for (const p of input.profiles) {
    userByKey.set(p.username.toLowerCase(), p.id);
    const k = phoneKey(p.phone_number);
    if (k) userByKey.set(k, p.id);
  }
  const usersByIp = new Map<string, Set<string>>();
  for (const l of input.logins) {
    const id = userByKey.get(l.login_key) ?? userByKey.get(phoneKey(l.login_key) ?? "");
    if (!id || !l.ip || l.ip === "unknown") continue;
    usersByIp.set(l.ip, (usersByIp.get(l.ip) ?? new Set()).add(id));
  }
  for (const [ip, ids] of usersByIp) {
    if (ids.size < ipThreshold) continue;
    for (const id of ids) {
      const others = [...ids].filter((x) => x !== id);
      add(id, { rule: RULES.sharedNetwork, severity: "low", reason: `${ids.size} accounts logged in from IP ${ip}: ${others.map(name).join(", ")} (can be a shared mobile network).`, related: others });
    }
  }

  return [...flags]
    .map(([id, fl]) => ({ user: byId.get(id)!, flags: fl, score: fl.reduce((s, f) => s + WEIGHT[f.severity], 0), facts: factOf(id) }))
    .sort((a, b) => b.score - a.score || a.user.username.localeCompare(b.user.username));
}
