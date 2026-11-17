import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import { getLang } from "@/lib/i18n-server";
import { TelegramBridge } from "@/components/TelegramBridge";
import { SITE_URL } from "@/lib/site";
import { DEFAULT_DESCRIPTION } from "@/lib/seo";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "GebetaSoccer | Predict the scores. Win the Gebeta.",
  description: DEFAULT_DESCRIPTION,
  applicationName: "GebetaSoccer",
  category: "sports",
  keywords: [
    "football prediction Ethiopia", "score predictor", "Premier League predictions", "football tips Ethiopia",
    "predict and win birr", "ጨዋታ ትንበያ", "እግር ኳስ", "GebetaSoccer", "Gebeta", "Superbru Ethiopia",
  ],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  other: { "geo.region": "ET", "geo.placename": "Addis Ababa" },
  icons: {
    // Google Search shows the site icon next to results: it wants a square image that is a multiple of 48 px.
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-icon.png",
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GebetaSoccer", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "GebetaSoccer | Predict the scores. Win the Gebeta.",
    description: "Predict 10 football matches in daily rounds and win the prize pool.",
    images: [{ url: "/og.png", width: 1080, height: 1080 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0912",
  width: "device-width",
  initialScale: 1,
};

/**
 * Runs before the app's own code, in very old JavaScript on purpose, so it
 * works even on old phones where the app itself fails to start. On a crash it
 * reports the error to /api/client-error and, inside Telegram (or with
 * ?debug=1), shows the error text in a red box so a screenshot tells us what broke.
 */
const EARLY_ERROR_CATCHER = `(function(){
  var shown=0, sent=0;
  function inTg(){ try { return /tgWebAppData|tgWebAppVersion/.test(location.hash) || !!window.TelegramWebviewProxy || /Telegram/i.test(navigator.userAgent) || /[?&]debug=1/.test(location.search); } catch(e){ return false; } }
  function send(msg, src, kind){
    if (sent >= 5) return; sent++;
    try {
      var body = JSON.stringify({ message: String(msg).slice(0,500), stack: String(src||'').slice(0,500), kind: kind, url: location.href.split('#')[0], ua: navigator.userAgent });
      if (navigator.sendBeacon) navigator.sendBeacon('/api/client-error', body);
      else { var x = new XMLHttpRequest(); x.open('POST','/api/client-error',true); x.setRequestHeader('Content-Type','application/json'); x.send(body); }
    } catch(e){}
  }
  function show(msg){
    if (!inTg() || shown >= 3) return; shown++;
    try {
      var box = document.getElementById('gs-err');
      if (!box) {
        box = document.createElement('div'); box.id = 'gs-err';
        box.setAttribute('style','position:fixed;left:8px;right:8px;top:8px;z-index:2147483647;background:#7f1d1d;color:#fff;font:12px/1.4 sans-serif;padding:10px 12px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.5);white-space:pre-wrap;word-break:break-word');
        var t = document.createElement('b'); t.appendChild(document.createTextNode('App error (send a screenshot to support):')); box.appendChild(t);
        var c = document.createElement('div'); c.setAttribute('style','float:right;cursor:pointer;padding:0 4px'); c.appendChild(document.createTextNode('✕'));
        c.onclick = function(){ box.parentNode && box.parentNode.removeChild(box); }; box.insertBefore(c, t);
        (document.body || document.documentElement).appendChild(box);
      }
      var line = document.createElement('div'); line.appendChild(document.createTextNode(String(msg).slice(0,300))); box.appendChild(line);
    } catch(e){}
  }
  function ignore(msg, src){
    msg = String(msg || '');
    if (/ResizeObserver loop|^Script error\\.?$/.test(msg)) return true;
    if (src && String(src).indexOf(location.origin) !== 0 && String(src).indexOf('/') !== 0) return true; /* browser extensions, other sites */
    return false;
  }
  window.addEventListener('error', function(e){
    if (e && e.target && e.target !== window && e.target.src) { /* a script/style file failed to load */
      var u = String(e.target.src);
      if (u.indexOf('/_next/') !== -1) { send('Failed to load ' + u, '', 'load'); show('Could not load part of the app. Check your internet and reload.'); }
      return;
    }
    var msg = e && e.message, src = e && e.filename;
    if (ignore(msg, src)) return;
    send(msg, (src||'') + ':' + (e && e.lineno) + ':' + (e && e.colno), 'error'); show(msg);
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    var r = e && e.reason, msg = (r && (r.message || r)) || 'Promise rejected';
    if (ignore(msg)) return;
    send(msg, r && r.stack, 'promise'); show(msg);
  });
})();`;

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${montserrat.variable} bg-plum`}>
      <body className="relative isolate min-h-dvh font-sans text-[#ece9f6] antialiased selection:bg-lilac/30">
        {/* eslint-disable-next-line react/no-danger */}
        <script dangerouslySetInnerHTML={{ __html: EARLY_ERROR_CATCHER }} />
        {children}
        {/* Telegram Mini App support (does nothing in a normal browser) */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <TelegramBridge />
      </body>
    </html>
  );
}
