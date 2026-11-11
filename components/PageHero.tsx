/** Photo banner used at the top of every public sub-page (like Superbru's). */
export function PageHero({
  title,
  subtitle,
  image = "/stadium.webp",
}: {
  title: string;
  subtitle?: string;
  image?: string;
}) {
  return (
    <section className="relative isolate overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={image} alt="" className="animate-pitch-zoom absolute inset-0 -z-10 h-full w-full object-cover" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[#0b0912]/85 via-[#1a1530]/60 to-plum" />
      <div className="mx-auto max-w-5xl px-6 pb-16 pt-16 text-center sm:pb-20 sm:pt-24">
        <h1 className="text-3xl font-extrabold uppercase tracking-[0.06em] text-white sm:text-5xl">{title}</h1>
        {subtitle && <p className="mx-auto mt-4 max-w-2xl text-base text-white/75">{subtitle}</p>}
      </div>
    </section>
  );
}
