import Link from "next/link";

/**
 * GebetaSoccer logo.
 * A real Gebeta board — two hinged wooden strips of 6 carved pits — laid on
 * the diagonal like it sits on a table. One strip holds golden seeds (your
 * predictions); a football lands in the end pit of the other (the match).
 * Flat colours only (no SVG ids), so it can be used many times on a page.
 */

const BOARD = "#231e36";
const PIT = "#0f0c18";
const GOLD = "#cbc2fa"; // seeds & hinges
const OUTLINE = "#ffffff";
const TILE = "#b2a5f6"; // lavender tile so the mark pops on dark backgrounds

const PIT_X = [10.6, 19.1, 27.6, 36.1, 44.6, 53.1];
const TOP_Y = 25.8;
const BOTTOM_Y = 38.2;

export function LogoMark({
  className = "h-9 w-9",
  tile = false,
  title = "GebetaSoccer",
}: {
  className?: string;
  /** Draw the rounded green app-icon tile behind the board. */
  tile?: boolean;
  title?: string;
}) {
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={title}>
      {tile && <rect width="64" height="64" rx="15" fill={TILE} />}
      {tile && <rect width="64" height="32" rx="15" fill="#ffffff" opacity="0.12" />}
      <g transform="rotate(-38 32 32)">
        {/* the two hinged strips */}
        <rect x="4.5" y="20" width="55" height="11.6" rx="5.8" fill={BOARD} stroke={OUTLINE} strokeWidth="1.6" />
        <rect x="4.5" y="32.4" width="55" height="11.6" rx="5.8" fill={BOARD} stroke={OUTLINE} strokeWidth="1.6" />
        <rect x="14" y="30" width="4.2" height="4.4" rx="0.9" fill={GOLD} />
        <rect x="45.8" y="30" width="4.2" height="4.4" rx="0.9" fill={GOLD} />

        {/* 2 × 6 carved pits */}
        {PIT_X.map((x) => (
          <g key={x} fill={PIT}>
            <circle cx={x} cy={TOP_Y} r="3.7" />
            <circle cx={x} cy={BOTTOM_Y} r="3.7" />
          </g>
        ))}

        {/* golden seeds, two per pit on the bottom strip */}
        {PIT_X.map((x) => (
          <g key={`s${x}`} fill={GOLD}>
            <circle cx={x - 1.1} cy={BOTTOM_Y - 0.9} r="1.35" />
            <circle cx={x + 1.2} cy={BOTTOM_Y + 0.7} r="1.35" />
          </g>
        ))}

        {/* the football, landing in the end pit */}
        <g transform={`translate(${PIT_X[5]} ${TOP_Y})`}>
          <circle r="4.9" fill="#ffffff" stroke={PIT} strokeWidth="0.5" />
          <path d="M0 -1.9 L1.8 -0.6 L1.1 1.5 L-1.1 1.5 L-1.8 -0.6 Z" fill={PIT} />
          <path
            d="M0 -1.9V-4.7M1.8 -0.6L4.5 -1.5M1.1 1.5L2.8 3.9M-1.1 1.5L-2.8 3.9M-1.8 -0.6L-4.5 -1.5"
            stroke={PIT}
            strokeWidth="0.65"
          />
        </g>
      </g>
    </svg>
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
  const mark = { sm: "h-10 w-10", md: "h-11 w-11", lg: "h-14 w-14" }[size];
  const text = { sm: "text-xl", md: "text-2xl", lg: "text-3xl" }[size];
  return (
    <Link href={href} className={`inline-flex items-center gap-2 ${className}`} aria-label="GebetaSoccer home">
      <LogoMark className={`${mark} shrink-0 drop-shadow-[0_4px_14px_rgba(169,156,240,0.45)]`} tile />
      <span className={`${text} font-extrabold tracking-tight text-white`}>
        Gebeta<span className="text-lilac">Soccer</span>
      </span>
    </Link>
  );
}
