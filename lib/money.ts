/** 1 unit = 200 ETB — always. */
export const ETB_PER_UNIT = 200;

/** Default share of the pool kept by the house (30%). */
export const DEFAULT_HOUSE_CUT = 0.3;

/** Manual Telegram top-ups: 5–50 units (1,000–10,000 ETB) per transaction. */
export const MIN_DEPOSIT_UNITS = 5;

/** A player always keeps at least this much in the account when withdrawing. */
export const KEEP_UNITS_ON_WITHDRAWAL = 1;
export const MAX_DEPOSIT_UNITS = 50;

export function unitsToEtb(units: number): number {
  return Math.round(units * ETB_PER_UNIT * 100) / 100;
}

const num = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

/** "5 Units" */
export function unitsLabel(units: number): string {
  const u = Number(units.toFixed(2));
  return `${num(u)} ${u === 1 ? "Unit" : "Units"}`;
}

/** "1,000 ETB" */
export function etbLabel(units: number): string {
  return `${num(unitsToEtb(units))} ETB`;
}

/** "5 Units (1,000 ETB)" — the standard way to show money everywhere. */
export function formatUnits(units: number): string {
  return `${unitsLabel(units)} (${etbLabel(units)})`;
}
