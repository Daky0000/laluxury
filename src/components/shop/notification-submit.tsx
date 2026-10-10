"use client";

import { useFormStatus } from "react-dom";

export function NotificationSubmit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="min-h-11 text-sm text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--text-primary)] disabled:cursor-wait disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-4">
      {pending ? "Updating…" : label}
    </button>
  );
}
