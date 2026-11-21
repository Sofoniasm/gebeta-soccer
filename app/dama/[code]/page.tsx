import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import type { DamaState } from "@/lib/dama";
import { DamaGame } from "../DamaGame";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Dama ${decodeURIComponent(code).toUpperCase()} · GebetaSoccer` };
}

export default async function DamaGamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase().slice(0, 12);
  const me = await getMe(`/dama/${code}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("dama_state", { p_code: code });

  if (!data) {
    return (
      <AppShell title="Dama 1 vs 1" next={`/dama/${code}`}>
        <Banner kind="error">Game {code} was not found. Check the link or ask your friend for the code.</Banner>
        <Link href="/dama" className="mt-4 inline-block text-sm font-bold text-lilac">← Dama 1 vs 1</Link>
      </AppShell>
    );
  }
  return (
    <AppShell next={`/dama/${code}`}>
      <Link href="/dama" className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← Dama 1 vs 1</Link>
      <DamaGame code={code} initial={data as DamaState} balanceUnits={me.balance_units} url={`${SITE_URL}/dama/${code}`} />
    </AppShell>
  );
}
