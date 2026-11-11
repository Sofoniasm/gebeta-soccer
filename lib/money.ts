/** 1 unit = 200 ETB. Change here if the unit price ever changes. */
export const ETB_PER_UNIT = 200;

/** Default share of the pool kept by the house (30%). */
export const DEFAULT_HOUSE_CUT = 0.3;

export function unitsToEtb(units: number): number {
  return Math.round(units * ETB_PER_UNIT * 100) / 100;
}

/** e.g. formatUnits(2) → "2 Units / 400 ETB" */
export function formatUnits(units: number): string {
  const etb = unitsToEtb(units).toLocaleString("en-US", { maximumFractionDigits: 2 });
  const u = Number(units.toFixed(2));
  return `${u} ${u === 1 ? "Unit" : "Units"} / ${etb} ETB`;
}
