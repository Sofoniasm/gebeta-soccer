"use client";

import { useFormStatus } from "react-dom";
import { SpinnerIcon } from "@/components/icons";

/** Submit button that shows a spinner while its form's server action runs. */
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
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      className={className}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {pending && <SpinnerIcon size={16} />}
      {children}
    </button>
  );
}
