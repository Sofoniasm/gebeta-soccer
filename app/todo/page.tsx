import Link from "next/link";
import { getMe } from "@/lib/me";
import { getTodo } from "@/lib/todo";
import { formatUnits } from "@/lib/money";
import { AppShell } from "@/components/AppShell";
import { MatchLine, groupByDay } from "@/components/MatchLine";
import { CheckIcon } from "@/components/icons";

export const metadata = { title: "To-do · GebetaSoccer" };
export const dynamic = "force-dynamic";

/** "in 3h 20m" / "in 2 days" */
function until(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(ms / 3600_000);
  if (h >= 48) return `in ${Math.floor(h / 24)} days`;
  if (h >= 1) return `in ${h}h ${Math.floor((ms % 3600_000) / 60_000)}m`;
  return `in ${Math.max(1, Math.floor(ms / 60_000))} min`;
}

export default async function TodoPage() {
  const me = await getMe("/todo");
  const todo = await getTodo();
  const nothing = todo.join.length === 0 && todo.picks.length === 0;

  return (
    <AppShell title="To-do" next="/todo">
      {nothing ? (
        <div className="rounded-[2rem] border border-emerald-300/20 bg-emerald-300/5 p-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-300/15 text-emerald-200">
            <CheckIcon size={24} />
          </span>
          <p className="mt-3 text-lg font-bold">All done!</p>
          <p className="mt-1 text-sm text-mist">You&apos;ve placed a slip in every open round. Want another go? You can add more slips on the Predict page until the first kickoff.</p>
          <Link href="/fixtures" className="mt-5 inline-block text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
            See upcoming fixtures →
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {todo.join.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-lilac/30 bg-gradient-to-br from-lilac/15 to-transparent p-5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lilac">Place your slip · closes {until(r.lockAt)}</p>
                <p className="text-xl font-extrabold">{r.name}</p>
                <p className="text-sm text-mist">
                  Entry {formatUnits(Number(r.entry_fee_units))} · your balance {formatUnits(me.balance_units)}
                </p>
              </div>
              <Link href={`/dashboard?round=${r.id}`} className="rounded-full bg-lilac px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-ink hover:bg-lilac-soft">
                Fill my slip →
              </Link>
            </div>
          ))}

          {todo.picks.length > 0 && (
            <section>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-lg font-extrabold">
                  {todo.picks.length} pick{todo.picks.length === 1 ? "" : "s"} needed
                </h2>
                <Link href="/dashboard" className="text-xs font-bold uppercase tracking-wider text-lilac hover:text-lilac-soft">
                  Make picks →
                </Link>
              </div>
              <div className="space-y-5">
                {groupByDay(todo.picks.map((p) => p.match)).map((g) => (
                  <div key={g.key}>
                    <p className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.15em] text-lilac">{g.label}</p>
                    <div className="space-y-2">
                      {g.matches.map((m) => (
                        <MatchLine
                          key={m.id}
                          m={m}
                          right={<span className="font-bold text-rose-200">{until(m.kickoff_at)}</span>}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-2xl border border-white/5 bg-card/50 p-4 text-xs text-mist">
                Forgot a match? You&apos;ll get a <b className="text-white">default pick</b> — the most popular score among other
                players — so you never score zero just for missing it. Your own pick is always better!
              </p>
            </section>
          )}
        </div>
      )}
    </AppShell>
  );
}
