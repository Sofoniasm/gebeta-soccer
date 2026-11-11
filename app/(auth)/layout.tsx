import { Logo } from "@/components/ui";
import { FlowLines } from "@/components/FlowLines";
import { PhoneMockup } from "@/components/PhoneMockup";
import { CheckIcon } from "@/components/icons";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative grid min-h-dvh overflow-hidden lg:grid-cols-2">
      {/* Left: brand panel (desktop only) */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#3a3260] via-plum to-ink lg:flex lg:flex-col lg:justify-between lg:p-12">
        <FlowLines />
        <Logo size="md" className="relative" />
        <div className="relative flex items-center gap-10">
          <div className="max-w-xs">
            <h2 className="text-4xl font-extrabold leading-tight">
              <span className="text-lilac">Predict</span> the scores.
              <br />
              Win <span className="text-lilac">the Gebeta.</span>
            </h2>
            <ul className="mt-8 space-y-3 text-sm text-mist">
              {["10 big matches every week", "70% of every pool goes to winners", "Top up easily with Telebirr"].map((t) => (
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
        <p className="relative text-xs text-mist/70">18+ only · Play responsibly</p>
      </aside>

      {/* Right: form */}
      <main className="relative flex flex-col items-center justify-center px-5 py-10">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-lilac/10 to-transparent lg:hidden" />
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
