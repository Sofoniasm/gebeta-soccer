import type { Metadata, Viewport } from "next";
import { Montserrat } from "next/font/google";
import "./globals.css";

const montserrat = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap" });

export const metadata: Metadata = {
  title: "GebetaSoccer — Predict the scores. Win the Gebeta.",
  description: "Predict 10 football matches every week, beat the leaderboard and win the prize pool.",
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
  themeColor: "#2c2740",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${montserrat.variable} bg-plum`}>
      <body className="min-h-dvh bg-plum font-sans text-[#ece9f6] antialiased selection:bg-lilac/30">
        {children}
      </body>
    </html>
  );
}
