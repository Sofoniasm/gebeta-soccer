import { Logo } from "@/components/ui";
import { FlowLines } from "@/components/FlowLines";
import { PhoneMockup } from "@/components/PhoneMockup";
import { CheckIcon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden lg:grid-cols-2">
      {/* Left: brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden bg-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/stadium.webp" alt="" className="animate-pitch-zoom absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0b0912]/85 via-[#2c2740]/60 to-[#0b0912]/90" />
        <FlowLines />
        <Logo size="lg" className="relative" />
        <div className="relative flex items-center gap-10">
          <div className="max-w-xs">
            <h2 className="text-4xl font-extrabold leading-tight">
              <span className="text-lilac">Predict</span> the scores.
              <br />
              Win <span className="text-lilac">the Gebeta.</span>
            </h2>
            <ul className="mt-8 space-y-3 text-sm text-mist">
              {["10 big matches every week", "Score over 15 of 30 to win 70% of the pool", "Top up easily with Telebirr"].map((t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-lilac/20 text-lilac">
                    <CheckIcon size={14} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <PhoneMockup className="hidden shrink-0 rotate-3 xl:block" />
        </div>
        <p className="relative text-xs text-white/70">18+ only · Play responsibly</p>
      </aside>

      {/* Right: form */}
      <main className="relative flex flex-col items-center justify-center px-5 py-10">
        <div className="pointer-events-none absolute inset-0 lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/stadium.webp" alt="" className="h-full w-full object-cover opacity-30" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0b0912]/70 via-plum/85 to-plum" />
        </div>
        <div className="relative w-full max-w-md space-y-8">
          <div className="text-center lg:hidden">
            <Logo size="lg" />
          </div>
          <div className="rounded-[2rem] border border-white/[0.07] bg-card/60 p-7 shadow-2xl shadow-black/30 backdrop-blur sm:p-9">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
