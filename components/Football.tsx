/** Simple football used in the animated hero. */
export function Football({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
      <circle r="11" fill="#ffffff" stroke="#0f0c18" strokeWidth="0.8" />
      <path d="M0 -4.3 L4.1 -1.3 L2.5 3.5 L-2.5 3.5 L-4.1 -1.3 Z" fill="#0f0c18" />
      <path d="M0 -4.3V-10.5M4.1 -1.3L10 -3.3M2.5 3.5L6.2 8.6M-2.5 3.5L-6.2 8.6M-4.1 -1.3L-10 -3.3" stroke="#0f0c18" strokeWidth="1.1" />
    </svg>
  );
}
