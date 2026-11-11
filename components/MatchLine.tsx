import Link from "next/link";
import type { MatchRow } from "@/lib/rounds";

const TZ = "Africa/Addis_Ababa";
export const timeOf = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
export const dayOf = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
export const dayKeyOf = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

export function Crest({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

/** Short status label: "LIVE", "FT", "PP", or kickoff time. */
export function statusLabel(m: MatchRow): string {
  if (m.status === "live") return "LIVE";
  if (m.status === "finished") return "FT";
  if (m.status === "postponed") return "Postponed";
  if (m.status === "cancelled") return "Cancelled";
  return timeOf(m.kickoff_at);
}

/**
 * One fixture row: time · home crest+name · score · away · right slot.
 * Clicking it opens the match page (picks, pick split).
 */
export function MatchLine({ m, right, sub }: { m: MatchRow; right?: React.ReactNode; sub?: React.ReactNode }) {
  const hasScore = m.actual_home_score !== null && m.actual_away_score !== null && m.status !== "scheduled";
  return (
    <Link
      href={`/match/${m.id}`}
      className="group grid grid-cols-[3.5rem_1fr_auto_1fr_auto] items-center gap-2 rounded-2xl border border-white/5 bg-card/50 px-3 py-3 transition hover:border-lilac/40 hover:bg-card/80 sm:gap-3 sm:px-4"
    >
      <span className={`text-xs font-bold ${m.status === "live" ? "animate-pulse text-rose-300" : "text-mist"}`}>{statusLabel(m)}</span>
      <span className="flex min-w-0 items-center justify-end gap-2 text-right">
        <span className="truncate text-sm font-semibold">{m.home_team}</span>
        <Crest src={m.home_crest} name={m.home_team} />
      </span>
      <span
        className={`min-w-[3.5rem] rounded-lg px-2 py-1 text-center text-sm font-extrabold ${
          hasScore ? "bg-white/10 text-white" : "text-mist/60"
        }`}
      >
        {hasScore ? `${m.actual_home_score} – ${m.actual_away_score}` : "v"}
      </span>
      <span className="flex min-w-0 items-center gap-2">
        <Crest src={m.away_crest} name={m.away_team} />
        <span className="truncate text-sm font-semibold">{m.away_team}</span>
      </span>
      <span className="flex min-w-[4.5rem] flex-col items-end text-right text-xs">{right}</span>
      {sub && <span className="col-span-5 -mt-1 pl-[4rem] text-xs text-mist">{sub}</span>}
    </Link>
  );
}

/** Group matches by local day, keeping order. */
export function groupByDay(list: MatchRow[]): { key: string; label: string; matches: MatchRow[] }[] {
  const out: { key: string; label: string; matches: MatchRow[] }[] = [];
  for (const m of list) {
    const key = dayKeyOf(m.kickoff_at);
    const last = out[out.length - 1];
    if (last && last.key === key) last.matches.push(m);
    else out.push({ key, label: dayOf(m.kickoff_at), matches: [m] });
  }
  return out;
}

/** Points chip: 3 exact / 1.5 close / 1 result / 0. */
export function PointsChip({ points }: { points: number | null }) {
  if (points === null) return null;
  const tone =
    points >= 3 ? "bg-emerald-300/20 text-emerald-100" : points >= 1.5 ? "bg-sky-300/20 text-sky-100" : points >= 1 ? "bg-lilac/20 text-lilac-soft" : "bg-white/5 text-mist";
  return <span className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${tone}`}>{points} pt{points === 1 ? "" : "s"}</span>;
}
