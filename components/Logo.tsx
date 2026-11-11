import Link from "next/link";

/**
 * GebetaSoccer logo — "stadium ring".
 * Twelve Gebeta pits (the board's 2 × 6) arranged in a ring around a
 * football, like a stadium seen from above. Some pits hold seeds.
 * Flat colours only (no SVG ids) so it can appear many times per page.
 */

const TILE = "#0e0b18";
const RING = "#a99cf0";
const PIT = "#231e36";
const LILAC = "#b4a7f5";
const SEED = "#d9d2ff";
const INK = "#0b0912";

const PITS = Array.from({ length: 12 }, (_, i) => {
  const t = ((i * 30 - 90) * Math.PI) / 180;
  return { x: 32 + 20.5 * Math.cos(t), y: 32 + 20.5 * Math.sin(t), seeds: i % 3 !== 0 };
});

export function LogoMark({
  className = "h-10 w-10",
  tile = true,
  title = "GebetaSoccer",
}: {
  className?: string;
  tile?: boolean;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      {tile && (
        <>
          <rect width="64" height="64" rx="15" fill={TILE} />
          <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="14.25" fill="none" stroke={RING} strokeOpacity="0.45" strokeWidth="1.5" />
        </>
      )}
      {/* stadium bowl */}
      <circle cx="32" cy="32" r="25" fill="none" stroke={LILAC} strokeWidth="1.2" opacity="0.45" />
      {/* 12 Gebeta pits */}
      {PITS.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="4.1" fill={PIT} stroke={LILAC} strokeWidth="1.6" />
          {p.seeds && (
            <>
              <circle cx={p.x - 1} cy={p.y - 0.6} r="1.1" fill={SEED} />
              <circle cx={p.x + 1.1} cy={p.y + 0.8} r="1.1" fill={SEED} />
            </>
          )}
        </g>
      ))}
      {/* the football */}
      <g transform="translate(32 32)">
        <circle r="11" fill="#ffffff" />
        <path d="M0 -4.3 L4.1 -1.3 L2.5 3.5 L-2.5 3.5 L-4.1 -1.3 Z" fill={INK} />
        <path
          d="M0 -4.3V-10.6M4.1 -1.3L10.1 -3.3M2.5 3.5L6.2 8.7M-2.5 3.5L-6.2 8.7M-4.1 -1.3L-10.1 -3.3M-7.6 -8L-4 -10.2M7.6 -8L4 -10.2M10.6 2.6L9.2 6.4M-10.6 2.6L-9.2 6.4M-2.4 10.8L2.4 10.8"
          stroke={INK}
          strokeWidth="1.2"
        />
      </g>
    </svg>
  );
}

/** "GebetaSoccer" wordmark: bright white "Gebeta", lavender gradient "Soccer". */
export function Wordmark({ className = "text-xl" }: { className?: string }) {
  return (
    <span className={`${className} font-extrabold tracking-[-0.03em]`}>
      <span className="bg-gradient-to-b from-white to-[#e6e1ff] bg-clip-text text-transparent">Gebeta</span>
      <span className="bg-gradient-to-r from-lilac-soft via-lilac to-[#8f80e6] bg-clip-text text-transparent">Soccer</span>
    </span>
  );
}

/** Mark + wordmark, linking home. */
export function Logo({
  size = "md",
  href = "/",
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  href?: string;
  className?: string;
}) {
  const mark = { sm: "h-10 w-10", md: "h-11 w-11", lg: "h-12 w-12" }[size];
  const text = { sm: "text-xl", md: "text-2xl", lg: "text-2xl sm:text-[1.7rem]" }[size];
  return (
    <Link href={href} className={`inline-flex items-center gap-2.5 ${className}`} aria-label="GebetaSoccer home">
      <LogoMark className={`${mark} shrink-0 drop-shadow-[0_4px_16px_rgba(169,156,240,0.45)]`} />
      <Wordmark className={text} />
    </Link>
  );
}
