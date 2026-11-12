import { Suspense } from "react";
import { TmaEntry } from "./TmaEntry";

export const metadata = { title: "GebetaSoccer · Telegram" };
export const dynamic = "force-dynamic";

/** Telegram Mini App start page (the bot's "Play" button opens this). */
export default function TmaPage() {
  return (
    <>
      <Suspense>
        <TmaEntry />
      </Suspense>
      {/* Old phones: if the app's code can't run, show a way out instead of a spinner forever.
          Plain old JavaScript on purpose, so it runs on any phone. */}
      <div id="tma-fallback" style={{ display: "none" }} className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0b0912] p-5 text-center text-sm text-mist">
        <p className="font-bold text-white">Taking too long?</p>
        <p className="mt-1">Your phone&apos;s browser may be out of date. Update <b>Android System WebView</b> and <b>Telegram</b> in the Play Store, or play on the website:</p>
        <a href="https://www.gebetasoccer.com/login" className="mt-3 inline-block rounded-full bg-[#a99cf5] px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-[#14111f]">Open www.gebetasoccer.com</a>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "setTimeout(function(){if(!document.documentElement.getAttribute('data-tma-ready')){var f=document.getElementById('tma-fallback');if(f)f.style.display='block';}},12000);",
        }}
      />
    </>
  );
}
