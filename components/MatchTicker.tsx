import { formatKickoff } from "@/lib/format";

export interface TickerMatch {
  home_team: string;
  away_team: string;
  kickoff_at: string;
  competition: string | null;
}

const FALLBACK: TickerMatch[] = [
  { home_team: "Arsenal", away_team: "Chelsea", kickoff_at: "", competition: "Premier League" },
  { home_team: "Liverpool", away_team: "Man City", kickoff_at: "", competition: "Premier League" },
  { home_team: "Man United", away_team: "Spurs", kickoff_at: "", competition: "Premier League" },
  { home_team: "Newcastle", away_team: "Aston Villa", kickoff_at: "", competition: "Premier League" },
  { home_team: "Brighton", away_team: "West Ham", kickoff_at: "", competition: "Premier League" },
];

/** Endless scrolling strip of upcoming fixtures, like a sportsbook ticker. */
export function MatchTicker({ matches }: { matches: TickerMatch[] }) {
  const items = matches.length > 0 ? matches : FALLBACK;
  const loop = [...items, ...items]; // duplicated for a seamless loop

  return (
    <div className="relative z-10 flex items-stretch overflow-hidden border-y border-white/5 bg-[#0b0912]">
      <div className="z-10 flex shrink-0 items-center gap-2 bg-lilac px-4 text-[11px] font-extrabold uppercase tracking-widest text-ink sm:px-6">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ink opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-ink" />
        </span>
        Up next
      </div>
      <div className="relative flex-1 overflow-hidden py-3">
        <div className="animate-marquee flex w-max gap-10 pl-6 hover:[animation-play-state:paused]">
          {loop.map((m, i) => (
            <span key={i} className="flex items-center gap-3 whitespace-nowrap text-sm">
              <span className="font-bold text-white">{m.home_team}</span>
              <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-lilac-soft">VS</span>
              <span className="font-bold text-white">{m.away_team}</span>
              {m.kickoff_at && <span className="text-xs text-mist">{formatKickoff(m.kickoff_at)}</span>}
              <span className="text-lilac/40">•</span>
            </span>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-10 bg-gradient-to-r from-[#0b0912] to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#0b0912] to-transparent" />
      </div>
    </div>
  );
}
