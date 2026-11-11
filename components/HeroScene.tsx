import { Football } from "./Football";

/**
 * Full-width hero background: night-stadium photo + plum/lavender colour
 * grade + subtle motion (floodlight beams, glow, a rolling ball).
 * Swap the photo any time by replacing /public/stadium.webp (and .jpg).
 */
export function HeroScene() {
  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* photo */}
      <picture>
        <source srcSet="/stadium.webp" type="image/webp" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stadium.jpg" alt="" className="animate-pitch-zoom absolute inset-0 h-full w-full object-cover object-[50%_40%]" fetchPriority="high" />
      </picture>

      {/* colour grade: keep the plum & lavender palette, darken for readable text */}
      <div className="absolute inset-0 bg-[#1a1530]/45 mix-blend-multiply" />
      <div className="absolute inset-0 bg-gradient-to-b from-[#0b0912]/80 via-[#0b0912]/25 to-plum" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_35%,transparent_0%,rgba(11,9,18,0.55)_70%)]" />

      {/* motion */}
      <div className="animate-beam-l absolute -left-24 -top-24 h-[130%] w-64 origin-top bg-gradient-to-b from-lilac/30 via-lilac/5 to-transparent blur-2xl" />
      <div className="animate-beam-r absolute -right-24 -top-24 h-[130%] w-72 origin-top bg-gradient-to-b from-lilac-soft/25 via-lilac/5 to-transparent blur-2xl" />
      <div className="animate-glow absolute left-1/2 top-[22%] h-80 w-80 -translate-x-1/2 rounded-full bg-lilac/20 blur-3xl" />
      <div className="animate-roll absolute bottom-[10%] left-0">
        <Football className="h-8 w-8 opacity-70 drop-shadow-[0_6px_10px_rgba(0,0,0,0.6)]" />
      </div>
    </div>
  );
}
