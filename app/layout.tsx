import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Montserrat } from "next/font/google";
import { TelegramBridge } from "@/components/TelegramBridge";
import { SITE_URL } from "@/lib/site";
import { DEFAULT_DESCRIPTION } from "@/lib/seo";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "GebetaSoccer — Predict the scores. Win the Gebeta.",
  description: DEFAULT_DESCRIPTION,
  applicationName: "GebetaSoccer",
  category: "sports",
  keywords: [
    "football prediction Ethiopia", "score predictor", "Premier League predictions", "football tips Ethiopia",
    "predict and win birr", "ጨዋታ ትንበያ", "እግር ኳስ", "GebetaSoccer", "Gebeta", "Superbru Ethiopia",
  ],
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 } },
  other: { "geo.region": "ET", "geo.placename": "Addis Ababa" },
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GebetaSoccer", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "GebetaSoccer — Predict the scores. Win the Gebeta.",
    description: "Predict 10 football matches every week and win the prize pool.",
    images: [{ url: "/og.png", width: 1080, height: 1080 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0912",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${montserrat.variable} bg-plum`}>
      <body className="relative isolate min-h-dvh font-sans text-[#ece9f6] antialiased selection:bg-lilac/30">
        {children}
        {/* Telegram Mini App support (does nothing in a normal browser) */}
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="afterInteractive" />
        <TelegramBridge />
      </body>
    </html>
  );
}
