import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import type { GebetaState } from "@/lib/gebeta";
import { GebetaGame } from "../GebetaGame";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Gebeta ${decodeURIComponent(code).toUpperCase()} · GebetaSoccer` };
}

export default async function GebetaGamePage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase().slice(0, 12);
  const me = await getMe(`/gebeta/${code}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("gebeta_state", { p_code: code });

  if (!data) {
    return (
      <AppShell title="Gebeta 1 vs 1" next={`/gebeta/${code}`}>
        <Banner kind="error">Game {code} was not found. Check the link or ask your friend for the code.</Banner>
        <Link href="/gebeta" className="mt-4 inline-block text-sm font-bold text-lilac">← Gebeta 1 vs 1</Link>
      </AppShell>
    );
  }
  return (
    <AppShell next={`/gebeta/${code}`}>
      <Link href="/gebeta" className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← Gebeta 1 vs 1</Link>
      <GebetaGame code={code} initial={data as GebetaState} balanceUnits={me.balance_units} url={`${SITE_URL}/gebeta/${code}`} />
    </AppShell>
  );
}
