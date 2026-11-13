import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import { etbLabel } from "@/lib/money";
import { AppShell } from "@/components/AppShell";
import { inputClass, secondaryButtonClass } from "@/components/ui";
import { CreateLeagueForm } from "./LeagueForms";
import { openLeagueByCode } from "./actions";

export const metadata = { title: "Leagues · GebetaSoccer" };
export const dynamic = "force-dynamic";

interface MyLeague {
  status: string;
  leagues: {
    id: number;
    code: string;
    name: string;
    entry_fee_units: number;
    status: string;
    captain_id: string;
    rounds: { name: string } | null;
  } | null;
}

const STATUS_STYLE: Record<string, string> = {
  active: "bg-emerald-300/15 text-emerald-100",
  pending: "bg-amber-200/15 text-amber-100",
  rejected: "bg-rose-400/15 text-rose-100",
};

export default async function LeaguesPage() {
  const me = await getMe("/leagues");
  const supabase = await createClient();

  const [{ data: mine }, { data: open }] = await Promise.all([
    supabase
      .from("league_members")
      .select("status, leagues(id, code, name, entry_fee_units, status, captain_id, rounds(name))")
      .eq("user_id", me.id)
      .order("requested_at", { ascending: false }),
    supabase.from("rounds").select("id, name").eq("status", "open").order("id", { ascending: false }),
  ]);
  const leagues = ((mine ?? []) as unknown as MyLeague[]).filter((m) => m.leagues);
  const card = "rounded-[2rem] border border-white/5 bg-card/60 p-6";

  return (
    <AppShell title="Private leagues" next="/leagues">
      <p className="mb-5 max-w-2xl text-sm text-mist">
        Play the same round's matches against just your friends, family or workmates. Make it <b className="text-white">free</b> for bragging rights,
        or <b className="text-white">paid</b> — everyone puts in the same amount and the winner takes 70% of the league pot.
      </p>

      <div className="grid gap-5 lg:grid-cols-[1fr_minmax(0,24rem)]">
        {/* My leagues */}
        <section className={card}>
          <h2 className="mb-4 text-lg font-extrabold">My leagues</h2>
          {leagues.length === 0 ? (
            <p className="py-6 text-center text-sm text-mist">You&apos;re not in a league yet. Create one or join with a friend&apos;s code.</p>
          ) : (
            <div className="space-y-2">
              {leagues.map(({ status, leagues: l }) => (
                <Link
                  key={l!.id}
                  href={`/leagues/${l!.code}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-ink/40 p-4 transition hover:border-lilac/40"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lilac/15 text-lg font-extrabold text-lilac">
                    {l!.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold">
                      {l!.name}
                      {l!.captain_id === me.id && <span className="ml-1.5 text-[10px] font-bold uppercase text-lilac">Captain</span>}
                    </span>
                    <span className="block truncate text-xs text-mist">
                      {l!.rounds?.name ?? "Round"} · {Number(l!.entry_fee_units) > 0 ? `${etbLabel(Number(l!.entry_fee_units))} entry` : "Free"} ·{" "}
                      {l!.status === "settled" ? "Finished" : l!.code}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${STATUS_STYLE[status] ?? "bg-white/10"}`}>
                    {status === "active" ? (l!.status === "settled" ? "Finished" : "Playing") : status}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <form action={openLeagueByCode} className="mt-5 flex gap-2 border-t border-white/10 pt-5">
            <input name="code" required placeholder="Have a code? GEBETA-X7F9" className={`${inputClass} uppercase`} autoComplete="off" />
            <button className={`${secondaryButtonClass} shrink-0`}>Open</button>
          </form>
        </section>

        {/* Create */}
        <section className={card}>
          <h2 className="mb-4 text-lg font-extrabold">Create a league</h2>
          <CreateLeagueForm rounds={(open ?? []) as { id: number; name: string }[]} balance={me.balance_units} />
        </section>
      </div>
    </AppShell>
  );
}
