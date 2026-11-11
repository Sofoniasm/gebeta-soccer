import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { ChallengeBuilder, type UpcomingMatch } from "./ChallengeBuilder";

export const metadata = { title: "New challenge · GebetaSoccer" };
export const dynamic = "force-dynamic";

export default async function NewChallengePage({ searchParams }: { searchParams: Promise<{ match?: string }> }) {
  const { match } = await searchParams;
  const me = await getMe("/challenges/new");
  const supabase = await createClient();
  const from = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const to = new Date(Date.now() + 14 * 86400 * 1000).toISOString();
  const { data } = await supabase
    .from("matches")
    .select("id, home_team, away_team, home_crest, away_crest, competition, kickoff_at")
    .eq("status", "scheduled")
    .gt("kickoff_at", from)
    .lt("kickoff_at", to)
    .order("kickoff_at")
    .limit(300);

  return (
    <AppShell title="New challenge" next="/challenges/new">
      <Link href="/challenges" className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← My challenges</Link>
      <ChallengeBuilder
        matches={(data ?? []) as UpcomingMatch[]}
        balanceUnits={me.balance_units}
        defaultTitle={`${me.username}'s challenge`.slice(0, 60)}
        phoneVerified={!!me.phone_verified_at}
        initialMatchId={match ? Number(match) : null}
      />
    </AppShell>
  );
}
