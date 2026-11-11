/** Round player picture, or their first letter on the brand gradient. */
export function Avatar({ name, src, size = 36, className = "" }: { name: string; src?: string | null; size?: number; className?: string }) {
  const style = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" width={size} height={size} loading="lazy" style={style} className={`shrink-0 rounded-full object-cover ring-1 ring-white/15 ${className}`} />;
  }
  return (
    <span
      style={{ ...style, fontSize: Math.max(10, Math.round(size * 0.42)) }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-lilac to-[#6c5fb3] font-extrabold text-ink ${className}`}
      aria-hidden="true"
    >
      {(name || "?").slice(0, 1).toUpperCase()}
    </span>
  );
}
