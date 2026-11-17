"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/client-error";

/**
 * Last-resort error screen (the whole layout crashed). Plain inline styles on
 * purpose: it must look right even if the site's CSS did not load.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError({ message: error.message, stack: error.stack, digest: error.digest, kind: "global" });
  }, [error]);

  const btn: React.CSSProperties = { display: "block", width: "100%", padding: "14px", borderRadius: 999, fontWeight: 700, fontSize: 14, border: 0, marginTop: 8 };
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: "100vh", background: "#1b1630", color: "#ece9f6", fontFamily: "system-ui, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
        <div style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 44 }}>⚠️</div>
          <h1 style={{ fontSize: 20, margin: "12px 0 6px" }}>GebetaSoccer could not start</h1>
          <p style={{ fontSize: 13, opacity: 0.8, margin: 0 }}>Tap Try again. If it keeps happening, send a screenshot of the red text to our support on Telegram.</p>
          <pre style={{ textAlign: "left", whiteSpace: "pre-wrap", fontSize: 11, background: "rgba(244,63,94,.15)", border: "1px solid rgba(253,164,175,.4)", color: "#ffe4e6", borderRadius: 16, padding: 12, margin: "16px 0", maxHeight: 160, overflow: "auto" }}>
            {error.message || "Unknown error"}
            {error.digest ? `\nCode: ${error.digest}` : ""}
          </pre>
          <button type="button" onClick={() => reset()} style={{ ...btn, background: "#a99cf5", color: "#14111f" }}>Try again</button>
          <button type="button" onClick={() => window.location.reload()} style={{ ...btn, background: "transparent", color: "#ece9f6", border: "1px solid rgba(255,255,255,.25)" }}>Reload the app</button>
          <a href="https://www.gebetasoccer.com/dashboard" style={{ ...btn, color: "#a99cf5", textDecoration: "none" }}>Open in the browser</a>
        </div>
      </body>
    </html>
  );
}
