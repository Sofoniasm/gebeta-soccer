import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getMe } from "@/lib/me";
import type { MatchRow } from "@/lib/rounds";
import { AppShell } from "@/components/AppShell";
import { MatchLine, groupByDay } from "@/components/MatchLine";

export const metadata = { title: "Fixtures · GebetaSoccer" };
export const dynamic = "force-dynamic";

type Row = MatchRow & { rounds: { name: string; status: string } | null };

export default async function FixturesPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  await getMe("/fixtures");
  const { view = "upcoming" } = await searchParams;
  const supabase = await createClient();
  const now = new Date();

  const q = supabase.from("matches").select("*, rounds(name, status)").limit(200);
  const { data } =
    view === "past"
      ? await q
          .lte("kickoff_at", now.toISOString())
          .gte("kickoff_at", new Date(now.getTime() - 21 * 86_400_000).toISOString())
          .order("kickoff_at", { ascending: false })
      : await q
          .gt("kickoff_at", new Date(now.getTime() - 3 * 3600_000).toISOString())
          .lte("kickoff_at", new Date(now.getTime() + 21 * 86_400_000).toISOString())
          .order("kickoff_at", { ascending: true });
  const list = (data ?? []) as Row[];
  const roundOf = new Map(list.map((m) => [m.id, m.rounds]));

  const tab = (key: string, label: string) => (
    <Link
      href={key === "upcoming" ? "/fixtures" : "/fixtures?view=past"}
      className={`rounded-full px-5 py-2 text-xs font-bold uppercase tracking-wider transition ${
        view === key || (key === "upcoming" && view !== "past") ? "bg-lilac text-ink" : "text-mist hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <AppShell title="Fixtures" next="/fixtures">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-full border border-white/10 bg-ink/60 p-1">
          {tab("upcoming", "Upcoming")}
          {tab("past", "Results")}
        </div>
        <p className="text-xs text-mist">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-lilac align-middle" /> in a GebetaSoccer round · times in Addis Ababa
        </p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-[2rem] border border-white/5 bg-card/60 p-10 text-center">
          <p className="text-lg font-bold">No fixtures {view === "past" ? "in the last 3 weeks" : "in the next 3 weeks"}</p>
          <p className="mt-1 text-sm text-mist">New matches are added automatically every day.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groupByDay(list).map((g) => (
            <section key={g.key}>
              <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-[0.15em] text-lilac">{g.label}</h2>
              <div className="space-y-2">
                {g.matches.map((m) => {
                  const r = roundOf.get(m.id);
                  return (
                    <MatchLine
                      key={m.id}
                      m={m}
                      right={
                        r ? (
                          <span className="flex items-center gap-1.5 font-bold text-lilac-soft">
                            <span className="h-2 w-2 rounded-full bg-lilac" />
                            {r.name}
                          </span>
                        ) : (
                          <span className="text-mist/60">{m.competition ?? ""}</span>
                        )
                      }
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppShell>
  );
}
