import { Logo } from "@/components/ui";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-forest/40 to-transparent" />
      <div className="relative w-full max-w-sm space-y-8">
        <div className="text-center">
          <Logo size="lg" />
        </div>
        <div className="rounded-3xl border border-white/10 bg-neutral-900/80 p-6 shadow-2xl shadow-black/40">
          {children}
        </div>
      </div>
    </main>
  );
}
