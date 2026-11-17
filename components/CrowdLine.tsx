"use client";

import Link from "next/link";
import { crowdSplit, type CrowdInfo } from "@/lib/crowd";

/**
 * One line under a match card: how other players picked.
 * Split shown → coloured bar + "Home 62% · Draw 4% · Away 34%".
 * Hidden (before kickoff, not Premium) → pick count + Premium link.
 */
export function CrowdLine({ crowd, homeTeam, awayTeam }: { crowd: CrowdInfo | undefined; homeTeam: string; awayTeam: string }) {
  if (!crowd || crowd.picks <= 0) return null;
  const split = crowdSplit(crowd);
  const picks = `${crowd.picks.toLocaleString("en-US")} pick${crowd.picks === 1 ? "" : "s"}`;
  if (!split) {
    return (
      <p className="mt-2 text-center text-[11px] text-mist" onClick={(e) => e.stopPropagation()}>
        👥 {picks}
        {crowd.picks >= 5 && (
          <>
            {" · "}
            <Link href="/premium" className="font-bold text-amber-200 hover:underline">⭐ see how they picked</Link>
          </>
        )}
      </p>
    );
  }
  return (
    <div className="mt-2" aria-label={`${picks}: ${homeTeam} ${split.home}%, draw ${split.draw}%, ${awayTeam} ${split.away}%`}>
      <div className="flex h-1.5 overflow-hidden rounded-full bg-white/5">
        <span className="bg-lilac" style={{ width: `${split.home}%` }} />
        <span className="bg-white/40" style={{ width: `${split.draw}%` }} />
        <span className="bg-amber-300" style={{ width: `${split.away}%` }} />
      </div>
      <p className="mt-1 flex justify-between gap-2 text-[11px] text-mist">
        <span className="truncate"><b className="text-white">{split.home}%</b> {homeTeam}</span>
        <span className="shrink-0">👥 {picks} · Draw <b className="text-white">{split.draw}%</b></span>
        <span className="truncate text-right"><b className="text-white">{split.away}%</b> {awayTeam}</span>
      </p>
    </div>
  );
}
