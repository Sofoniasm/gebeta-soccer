/** Gebeta Premium: plans and the player's own status. */
import { ETB_PER_UNIT } from "@/lib/money";

export const PLANS = {
  monthly: { units: 2, days: 30, label: "Monthly" },
  yearly: { units: 20, days: 365, label: "Yearly" },
} as const;
export type Plan = keyof typeof PLANS;
export const planEtb = (p: Plan) => PLANS[p].units * ETB_PER_UNIT;

export interface MyPremium {
  active: boolean;
  plan: Plan | null;
  until: string | null;
  autoRenew: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getMyPremium(supabase: any, userId: string): Promise<MyPremium> {
  const { data } = await supabase.from("subscriptions").select("plan, current_period_end, auto_renew").eq("user_id", userId).maybeSingle();
  const row = data as { plan: Plan; current_period_end: string; auto_renew: boolean } | null;
  if (!row) return { active: false, plan: null, until: null, autoRenew: false };
  return { active: new Date(row.current_period_end).getTime() > Date.now(), plan: row.plan, until: row.current_period_end, autoRenew: row.auto_renew };
}

/** Friendly words for database errors when buying. */
export function premiumError(m: string): string {
  if (m.includes("insufficient")) return "Not enough Units in your wallet. Top up first, then come back.";
  if (m.includes("date of birth")) return "Add your date of birth (18+) on your Profile first.";
  if (m.includes("18 or older")) return "Gebeta Premium is for players aged 18 or older.";
  if (m.includes("taking a break")) return m.replace(/^.*betting paused: /, "You're taking a break: ") + ". Premium can be bought after it ends.";
  if (m.includes("subscription") || m.includes("buy_premium")) return "Premium isn't switched on yet. The admin needs to run the 0031 SQL.";
  return "Could not complete the payment. Please try again.";
}
