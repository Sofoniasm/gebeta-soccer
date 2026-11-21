import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import type { ChessState } from "@/lib/chess";
import { ChessGame } from "../ChessGame";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Chess ${decodeURIComponent(code).toUpperCase()} · GebetaSoccer` };
}

export default async function ChessGamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase().slice(0, 12);
  const me = await getMe(`/chess/${code}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("chess_state", { p_code: code });

  if (!data) {
    return (
      <AppShell title="Chess 1 vs 1" next={`/chess/${code}`}>
        <Banner kind="error">Game {code} was not found. Check the link or ask your friend for the code.</Banner>
        <Link href="/chess" className="mt-4 inline-block text-sm font-bold text-lilac">← Chess 1 vs 1</Link>
      </AppShell>
    );
  }
  return (
    <AppShell next={`/chess/${code}`}>
      <Link href="/chess" className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← Chess 1 vs 1</Link>
      <ChessGame code={code} initial={data as ChessState} balanceUnits={me.balance_units} url={`${SITE_URL}/chess/${code}`} />
    </AppShell>
  );
}
