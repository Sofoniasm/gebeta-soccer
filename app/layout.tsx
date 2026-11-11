import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GebetaSoccer — Predict. Compete. Win.",
  description: "Predict 10 football matches every week and top the table.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="bg-neutral-950">
      <body className="min-h-dvh bg-neutral-950 text-neutral-100 antialiased selection:bg-emerald-400/30">
        {children}
      </body>
    </html>
  );
}
