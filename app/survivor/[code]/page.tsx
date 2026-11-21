import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import type { SurvivorState } from "@/lib/survivor";
import { SurvivorPool } from "../SurvivorPool";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Survivor ${decodeURIComponent(code).toUpperCase()} · GebetaSoccer` };
}

export default async function SurvivorPoolPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase().slice(0, 12);
  const me = await getMe(`/survivor/${code}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("survivor_state", { p_code: code });

  if (!data) {
    return (
      <AppShell title="Survivor pools" next={`/survivor/${code}`}>
        <Banner kind="error">Pool {code} was not found. Check the link or ask your friend for the code.</Banner>
        <Link href="/survivor" className="mt-4 inline-block text-sm font-bold text-lilac">← Survivor pools</Link>
      </AppShell>
    );
  }
  return (
    <AppShell next={`/survivor/${code}`}>
      <Link href="/survivor" className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← Survivor pools</Link>
      <SurvivorPool code={code} initial={data as SurvivorState} balanceUnits={me.balance_units} url={`${SITE_URL}/survivor/${code}`} />
    </AppShell>
  );
}
