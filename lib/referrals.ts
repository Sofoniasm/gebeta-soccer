/**
 * Sales & Referrals (pure, no database). Mirror of supabase/migrations/0044_referrals.sql.
 *
 * A salesperson gets a share of the HOUSE's cut only — never of players'
 * stakes or winnings — and only when the round / challenge settles:
 *   - main rounds : 5% of the round's house cut on the referred player's stakes
 *   - challenges  : 2% of the challenge fee on the referred player's stake
 *   - refunded stakes (solo refund, all matches called off, refunded
 *     challenge) pay nothing
 *   - nobody won (house keeps the pool): still only 5% of the NORMAL house cut
 *   - private leagues: no commission
 * Money is integer cents, rounded DOWN to 0.01 Unit per player per round /
 * challenge. Less than 0.01 Unit is skipped (not carried over).
 */
import { normalizeEthiopianPhone } from "@/lib/phone";

/** Share of the house cut paid on main rounds (5%). */
export const ROUND_COMMISSION_SHARE = 0.05;
/** Share of the challenge fee paid on private challenges (2%). */
export const CHALLENGE_COMMISSION_SHARE = 0.02;

/** Cookie that keeps ?ref=CODE through the whole sign-up (also the Telegram flow). */
export const REF_COOKIE = "gs_ref";
export const REF_COOKIE_MAX_AGE = 7 * 24 * 3600;

/** "laki10 " -> "LAKI10". Letters and digits only, 3–20 long; anything else -> null. */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const c = String(raw ?? "").trim().toUpperCase();
  return /^[A-Z0-9]{3,20}$/.test(c) ? c : null;
}

/** https://www.gebetasoccer.com/register?ref=LAKI10 */
export function inviteLink(siteUrl: string, code: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/register?ref=${encodeURIComponent(code)}`;
}

/** 0.300 -> 300 (database percentages have 3 decimals: numeric(4,3)). */
const perMille = (x: number) => Math.round(x * 1000);

/**
 * Commission in integer cents (0.01 Unit), rounded down.
 * Same as SQL: floor(stake_cents * house_pct * share_pct).
 */
export function commissionCents(stakeUnits: number, housePct: number, share: number): number {
  if (!(stakeUnits > 0) || !(housePct > 0) || !(share > 0)) return 0;
  const stakeCents = Math.round(stakeUnits * 100);
  return Math.floor((stakeCents * perMille(housePct) * perMille(share)) / 1_000_000);
}

/** Commission in Units (0 when below 0.01 Unit). */
export function commissionUnits(stakeUnits: number, housePct: number, share: number): number {
  return commissionCents(stakeUnits, housePct, share) / 100;
}

export interface Commission { salespersonId: string; playerId: string; stakeUnits: number; units: number }

/** Who invited whom: player id -> salesperson id (only salespeople who still have a code). */
export type Referrers = Record<string, string | null | undefined>;

/**
 * Commissions for one main round, at settlement.
 * `ledger` = the round's entry_fee (negative) and refund (positive) rows, so
 * a refunded slip counts 0. `players` = distinct players in the round.
 */
export function roundCommissions(input: {
  houseCut: number;
  players: number;
  finishedMatches: number;
  ledger: { userId: string; kind: "entry_fee" | "refund"; units: number }[];
  referrers: Referrers;
}): Commission[] {
  // Solo refund (0039) or every match called off: no house cut earned -> nothing.
  if (input.players <= 1 || input.finishedMatches <= 0) return [];
  const stake = new Map<string, number>();
  for (const l of input.ledger) stake.set(l.userId, Math.round(((stake.get(l.userId) ?? 0) - l.units) * 100) / 100);
  const out: Commission[] = [];
  for (const [playerId, stakeUnits] of stake) {
    const salespersonId = input.referrers[playerId];
    if (!salespersonId || salespersonId === playerId || stakeUnits <= 0) continue;
    const units = commissionUnits(stakeUnits, input.houseCut, ROUND_COMMISSION_SHARE);
    if (units > 0) out.push({ salespersonId, playerId, stakeUnits, units });
  }
  return out;
}

/** Commissions for one private challenge. Only a SETTLED challenge pays; a refunded one pays nothing. */
export function challengeCommissions(input: {
  outcome: "settled" | "refunded";
  feePct: number;
  stakeUnits: number;
  entrants: string[];
  referrers: Referrers;
}): Commission[] {
  if (input.outcome !== "settled" || new Set(input.entrants).size < 2) return [];
  const out: Commission[] = [];
  for (const playerId of new Set(input.entrants)) {
    const salespersonId = input.referrers[playerId];
    if (!salespersonId || salespersonId === playerId) continue;
    const units = commissionUnits(input.stakeUnits, input.feePct, CHALLENGE_COMMISSION_SHARE);
    if (units > 0) out.push({ salespersonId, playerId, stakeUnits: input.stakeUnits, units });
  }
  return out;
}

// ---- fraud: referred players that look like the salesperson ----------------

export interface RefPerson { id: string; username: string; phone_number: string | null; referral_ip?: string | null }
export interface RefWithdrawal { user_id: string; payout_phone: string; status: string }
export interface RefLogin { user_id: string; ip: string }
export interface RefFlag { playerId: string; username: string; reasons: string[] }

const phoneKey = (p: string | null | undefined) => (p ? normalizeEthiopianPhone(p) ?? p.replace(/\D/g, "") : null);

/**
 * Referred players who share a phone, payout number or IP with the
 * salesperson who invited them. A flag is a reason to look, not proof
 * (mobile carriers share IPs a lot).
 */
export function referralLookalikes(input: {
  salesperson: RefPerson;
  referred: RefPerson[];
  withdrawals: RefWithdrawal[];
  logins: RefLogin[];
}): RefFlag[] {
  const s = input.salesperson;
  const live = input.withdrawals.filter((w) => w.status !== "rejected");
  const payoutsOf = (id: string) => new Set(live.filter((w) => w.user_id === id).map((w) => phoneKey(w.payout_phone)).filter(Boolean) as string[]);
  const ipsOf = (id: string) => new Set(input.logins.filter((l) => l.user_id === id && l.ip && l.ip !== "unknown").map((l) => l.ip));

  const sPhone = phoneKey(s.phone_number);
  const sPayouts = payoutsOf(s.id);
  const sIps = ipsOf(s.id);
  if (s.referral_ip) sIps.add(s.referral_ip);

  const out: RefFlag[] = [];
  for (const p of input.referred) {
    if (p.id === s.id) continue;
    const reasons: string[] = [];
    const pPhone = phoneKey(p.phone_number);
    const pPayouts = payoutsOf(p.id);
    if (pPhone && sPayouts.has(pPhone)) reasons.push(`Their phone ${pPhone} is the salesperson's payout number`);
    if (sPhone && pPayouts.has(sPhone)) reasons.push(`Cashes out to the salesperson's phone ${sPhone}`);
    for (const n of pPayouts) if (sPayouts.has(n) && n !== sPhone) reasons.push(`Same payout number as the salesperson: ${n}`);
    const pIps = ipsOf(p.id);
    if (p.referral_ip) pIps.add(p.referral_ip);
    const shared = [...pIps].filter((ip) => sIps.has(ip));
    if (shared.length) reasons.push(`Same IP as the salesperson: ${shared.slice(0, 3).join(", ")} (can be a shared mobile network)`);
    if (reasons.length) out.push({ playerId: p.id, username: p.username, reasons });
  }
  return out;
}
