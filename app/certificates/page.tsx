import { getMe } from "@/lib/me";
import { getCareer, certificatesFor } from "@/lib/career";
import { AppShell } from "@/components/AppShell";

export const metadata = { title: "Certificates · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function CertificatesPage() {
  const me = await getMe("/certificates");
  const certs = certificatesFor(await getCareer(me.id));
  const earned = certs.filter((c) => c.earned).length;

  return (
    <AppShell title="Certificates" next="/certificates">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-mist">Earn certificates for great predictions and milestones. They show on your Career page.</p>
        <span className="rounded-full bg-lilac/15 px-4 py-1.5 text-sm font-extrabold text-lilac-soft">
          {earned} / {certs.length} earned
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {certs.map((c) => {
          const pct = c.progress ? Math.round((c.progress.have / c.progress.need) * 100) : c.earned ? 100 : 0;
          return (
            <div
              key={c.id}
              className={`relative overflow-hidden rounded-3xl border p-5 ${
                c.earned ? "border-lilac/40 bg-gradient-to-br from-lilac/20 via-card to-card" : "border-white/5 bg-card/50"
              }`}
            >
              <div className="flex items-start gap-4">
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-3xl ${
                    c.earned ? "bg-lilac/20" : "bg-white/5 opacity-40 grayscale"
                  }`}
                >
                  {c.emoji}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-extrabold">{c.name}</p>
                  <p className="text-sm text-mist">{c.how}</p>
                </div>
                {c.earned && <span className="rounded-full bg-emerald-300/15 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-100">Earned</span>}
              </div>
              {!c.earned && c.progress && (
                <div className="mt-4">
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div className="h-full rounded-full bg-lilac/70" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1 text-right text-[11px] text-mist">
                    {c.progress.have.toLocaleString("en-US")} / {c.progress.need.toLocaleString("en-US")}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
