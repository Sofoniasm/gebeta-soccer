"use client";

import { useEffect } from "react";

/**
 * While a page shows a fixed action bar at the bottom (Place bet, Create & pay),
 * mark the page so the 💬 help bubble moves up above it on phones instead of
 * covering the button (see `body[data-bottombar]` in app/globals.css).
 */
export function useBottomBar(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.body.dataset.bottombar = "1";
    return () => {
      delete document.body.dataset.bottombar;
    };
  }, [active]);
}
