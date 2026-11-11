import { Football } from "./Football";

/**
 * Full-width animated stadium background for the hero:
 * floodlight beams, a glowing pitch in perspective, and footballs rolling across.
 * Pure CSS/SVG — no video file, so it loads instantly on mobile data.
 */
export function HeroScene() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* night-stadium base */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,#3a3166_0%,#16121f_45%,#0b0912_100%)]" />

      {/* floodlight beams */}
      <div className="animate-beam-l absolute -left-24 -top-24 h-[140%] w-64 origin-top bg-gradient-to-b from-lilac/40 via-lilac/10 to-transparent blur-2xl" />
      <div className="animate-beam-r absolute -right-24 -top-24 h-[140%] w-72 origin-top bg-gradient-to-b from-lilac-soft/35 via-lilac/10 to-transparent blur-2xl" />

      {/* glow orbs */}
      <div className="animate-glow absolute left-[8%] top-[18%] h-72 w-72 rounded-full bg-lilac/25 blur-3xl" />
      <div className="animate-glow absolute right-[6%] top-[40%] h-80 w-80 rounded-full bg-[#6c5fb3]/30 blur-3xl [animation-delay:2s]" />

      {/* pitch in perspective, full width */}
      <div className="absolute inset-x-[-10%] bottom-[-35%] h-[85%]">
        <svg
          viewBox="0 0 1600 900"
          preserveAspectRatio="none"
          className="animate-pitch h-full w-full origin-bottom"
        >
          <g fill="none" stroke="#a99cf0" strokeWidth="3" opacity="0.35">
            <rect x="40" y="40" width="1520" height="820" />
            <line x1="800" y1="40" x2="800" y2="860" />
            <circle cx="800" cy="450" r="120" />
            <circle cx="800" cy="450" r="6" fill="#a99cf0" />
            <rect x="40" y="250" width="220" height="400" />
            <rect x="40" y="350" width="80" height="200" />
            <rect x="1340" y="250" width="220" height="400" />
            <rect x="1480" y="350" width="80" height="200" />
          </g>
          {/* mowing stripes */}
          {Array.from({ length: 8 }).map((_, i) => (
            <rect key={i} x={40 + i * 190} y="40" width="95" height="820" fill="#a99cf0" opacity="0.04" />
          ))}
        </svg>
      </div>

      {/* rolling footballs */}
      <div className="animate-roll absolute bottom-[14%] left-0">
        <Football className="h-9 w-9 opacity-80 drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]" />
      </div>
      <div className="animate-roll-slow absolute bottom-[30%] left-0 [animation-delay:-12s]">
        <Football className="h-6 w-6 opacity-50" />
      </div>

      {/* fade into the next section */}
      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-b from-transparent to-plum" />
    </div>
  );
}
