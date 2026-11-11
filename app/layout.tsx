import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "GebetaSoccer — Predict. Win. Dominate the Gebeta.",
  description: "Predict 10 football matches every week, beat the leaderboard and win the prize pool.",
  icons: { icon: "/icon.svg", apple: "/apple-icon.png" },
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "GebetaSoccer", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "GebetaSoccer — Predict. Win. Dominate the Gebeta.",
    description: "Predict 10 football matches every week and win the prize pool.",
    images: [{ url: "/og.png", width: 1080, height: 1080 }],
  },
};

export const viewport: Viewport = {
  themeColor: "#07110c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} bg-pitch`}>
      <body className="min-h-dvh bg-pitch font-sans text-neutral-100 antialiased selection:bg-amber-400/30">
        {children}
      </body>
    </html>
  );
}
