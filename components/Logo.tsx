import Link from "next/link";

/**
 * GebetaSoccer logo.
 * The mark is a Gebeta board (2 × 6 pits with golden seeds) with a
 * football dropping into one of the pits. Flat colours only (no SVG ids),
 * so it can appear many times on a page and scales from 16px to a poster.
 */

const FOREST = "#146c43";
const PIT = "#062b1b";
const GOLD = "#fbbf24";

const PITS_X = [12, 20, 28, 36, 44, 52];
// [x, y, r] golden seeds in some pits
const SEEDS: [number, number, number][] = [
  [11, 14, 1.3], [13.2, 15.4, 1.3], [20, 14.5, 1.3], [28, 14.5, 1.3],
  [12, 25.5, 1.3], [27, 25, 1.3], [29.2, 26.3, 1.3],
  [43, 25, 1.3], [45.2, 26.2, 1.3], [44, 23.8, 1.1], [52, 25.5, 1.3],
];

export function LogoMark({ className = "h-8 w-auto", title = "GebetaSoccer" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 64 40" className={className} role="img" aria-label={title}>
      <rect x="1.5" y="5.5" width="61" height="29" rx="14.5" fill={FOREST} stroke={GOLD} strokeWidth="1.8" />
      {PITS_X.map((x) => (
        <g key={x} fill={PIT}>
          <circle cx={x} cy="14.5" r="3.6" />
          <circle cx={x} cy="25.5" r="3.6" />
        </g>
      ))}
      {SEEDS.map(([x, y, r], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={GOLD} />
      ))}
      {/* football dropping into a pit */}
      <g transform="translate(44 14.5)">
        <circle r="6.2" fill="#ffffff" stroke={PIT} strokeWidth="0.9" />
        <path d="M0 -2.4 L2.3 -0.7 L1.4 2 L-1.4 2 L-2.3 -0.7 Z" fill={PIT} />
        <path
          d="M0 -2.4 L0 -6 M2.3 -0.7 L5.8 -1.9 M1.4 2 L3.6 4.9 M-1.4 2 L-3.6 4.9 M-2.3 -0.7 L-5.8 -1.9"
          stroke={PIT}
          strokeWidth="0.8"
        />
      </g>
    </svg>
  );
}

/** Mark + wordmark, linking home. `size` controls the overall scale. */
export function Logo({ size = "md", href = "/", className = "" }: { size?: "sm" | "md" | "lg"; href?: string; className?: string }) {
  const mark = { sm: "h-6", md: "h-8", lg: "h-12" }[size];
  const text = { sm: "text-lg", md: "text-xl", lg: "text-3xl" }[size];
  return (
    <Link href={href} className={`inline-flex items-center gap-2 ${className}`} aria-label="GebetaSoccer home">
      <LogoMark className={`${mark} w-auto shrink-0`} />
      <span className={`${text} font-black tracking-tight text-white`}>
        Gebeta<span className="text-amber-400">Soccer</span>
      </span>
    </Link>
  );
}
