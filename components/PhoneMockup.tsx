import { LogoMark } from "./Logo";

const sample = [
  { home: "Arsenal", away: "Chelsea", h: 2, a: 1, time: "Sat 15:30" },
  { home: "Liverpool", away: "Man City", h: 1, a: 1, time: "Sat 18:00" },
  { home: "Spurs", away: "Newcastle", h: 0, a: 2, time: "Sun 17:30" },
];

/** Static preview of the prediction screen, used on the landing & auth pages. */
export function PhoneMockup({ className = "" }: { className?: string }) {
  return (
    <div className={`w-[17rem] rounded-[2.2rem] border border-white/15 bg-ink p-3 shadow-2xl shadow-black/50 ${className}`}>
      <div className="rounded-[1.7rem] bg-plum px-3 pb-4 pt-3">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <LogoMark className="h-6 w-6" tile />
            <span className="text-[11px] font-extrabold">Gebeta<span className="text-lilac">Soccer</span></span>
          </div>
          <span className="rounded-full bg-lilac/20 px-2 py-0.5 text-[10px] font-bold text-lilac-soft">2 Units</span>
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-mist">Week 1 · 10 matches</p>
        <div className="mt-2 space-y-2">
          {sample.map((m) => (
            <div key={m.home} className="rounded-2xl bg-card/80 p-2.5">
              <p className="mb-1.5 text-[9px] text-mist">{m.time}</p>
              <div className="flex items-center justify-between gap-1">
                <span className="w-16 truncate text-[11px] font-semibold">{m.home}</span>
                <div className="flex items-center gap-1">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-xs font-bold">{m.h}</span>
                  <span className="text-[10px] text-mist">:</span>
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-xs font-bold">{m.a}</span>
                </div>
                <span className="w-16 truncate text-right text-[11px] font-semibold">{m.away}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 rounded-full bg-lilac py-2 text-center text-[10px] font-bold uppercase tracking-wider text-ink">
          Submit predictions
        </div>
      </div>
    </div>
  );
}
