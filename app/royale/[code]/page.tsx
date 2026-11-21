import Link from "next/link";
import { getMe } from "@/lib/me";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import { Banner } from "@/components/ui";
import { SITE_URL } from "@/lib/site";
import type { RoyaleState } from "@/lib/royale";
import { RoyaleRoom } from "../RoyaleRoom";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return { title: `Quiz Royale ${decodeURIComponent(code).toUpperCase()} · GebetaSoccer` };
}

export default async function RoyaleRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params;
  const code = decodeURIComponent(raw).toUpperCase().slice(0, 12);
  const me = await getMe(`/royale/${code}`);
  const supabase = await createClient();
  const { data } = await supabase.rpc("royale_state", { p_code: code });

  if (!data) {
    return (
      <AppShell title="Quiz Royale" next={`/royale/${code}`}>
        <Banner kind="error">Room {code} was not found. Check the link or ask your friend for the code.</Banner>
        <Link href="/royale" className="mt-4 inline-block text-sm font-bold text-lilac">← Quiz Royale</Link>
      </AppShell>
    );
  }
  return (
    <AppShell next={`/royale/${code}`}>
      <Link href="/royale" className="mb-4 inline-block text-xs font-bold uppercase tracking-widest text-lilac hover:text-lilac-soft">← Quiz Royale</Link>
      <RoyaleRoom code={code} initial={data as RoyaleState} balanceUnits={me.balance_units} url={`${SITE_URL}/royale/${code}`} />
    </AppShell>
  );
}
