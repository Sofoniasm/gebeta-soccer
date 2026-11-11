/** Soft flowing lavender lines that run across the full page width
 *  (fills the empty sides on wide screens, like the reference design). */
export function FlowLines({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      viewBox="0 0 1440 2400"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <g fill="none" stroke="#a99cf0" strokeWidth="1.2">
        <path opacity="0.18" d="M-40 180 C 300 60, 520 420, 820 300 S 1300 40, 1500 220" />
        <path opacity="0.12" d="M-60 820 C 260 640, 480 1040, 760 900 S 1240 640, 1500 860" />
        <path opacity="0.14" d="M1500 1180 C 1180 1060, 980 1460, 640 1360 S 120 1180, -60 1420" />
        <path opacity="0.10" d="M-40 1960 C 380 1800, 620 2200, 940 2060 S 1320 1880, 1500 2040" />
      </g>
    </svg>
  );
}
