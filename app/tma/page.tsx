import { Suspense } from "react";
import { TmaEntry } from "./TmaEntry";

export const metadata = { title: "GebetaSoccer · Telegram" };
export const dynamic = "force-dynamic";

/** Telegram Mini App start page (the bot's "Play" button opens this). */
export default function TmaPage() {
  return (
    <Suspense>
      <TmaEntry />
    </Suspense>
  );
}
