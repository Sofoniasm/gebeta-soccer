const TZ = "Africa/Addis_Ababa";

/** e.g. "Sat 15 Nov, 18:00" in Ethiopian time (same on server and phone). */
export function formatKickoff(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatEtb(etb: number): string {
  return `${etb.toLocaleString("en-US", { maximumFractionDigits: 2 })} ETB`;
}
