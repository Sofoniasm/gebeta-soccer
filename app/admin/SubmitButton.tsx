"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons";

/**
 * Submit button that shows a spinner while its form's server action runs.
 * With `confirm`, the first click opens a small confirmation right on the
 * page (no browser pop-up); "Yes" then submits.
 */
export function SubmitButton({
  children,
  className,
  confirm,
  name,
  value,
}: {
  children: React.ReactNode;
  className?: string;
  confirm?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);

  if (confirm && asking && !pending) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200/30 bg-amber-200/10 px-3 py-2 text-sm">
        <span className="font-semibold text-amber-50">{confirm}</span>
        <button
          type="submit"
          name={name}
          value={value}
          className="rounded-full bg-lilac px-4 py-1.5 text-xs font-extrabold uppercase tracking-wider text-ink hover:brightness-110"
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="rounded-full border border-white/15 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-mist hover:text-white"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <button
      type={confirm ? "button" : "submit"}
      name={confirm ? undefined : name}
      value={confirm ? undefined : value}
      disabled={pending}
      className={className}
      onClick={confirm ? () => setAsking(true) : undefined}
    >
      {pending && <SpinnerIcon size={16} />}
      {children}
    </button>
  );
}
