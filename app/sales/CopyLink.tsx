"use client";

import { useState } from "react";
import { inputClass, secondaryButtonClass } from "@/components/ui";

/** Invite link with a Copy button and a Telegram share button. */
export function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const text = "⚽ Join me on GebetaSoccer: predict football scores and win. Sign up with my link:";
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input readOnly value={url} className={`${inputClass} text-sm`} onFocus={(e) => e.target.select()} aria-label="Invite link" />
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              /* clipboard blocked: the field is selectable */
            }
          }}
          className={`${secondaryButtonClass} shrink-0`}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <a
        href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#2aabee] px-5 py-3 text-xs font-bold uppercase tracking-wider text-white hover:brightness-110"
      >
        Share on Telegram
      </a>
    </div>
  );
}
