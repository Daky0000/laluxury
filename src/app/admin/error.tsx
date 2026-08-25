"use client";

import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/**
 * Catches permission failures from `requirePermission`, so a staff member who
 * reaches a page above their role sees an explanation rather than a stack trace.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isPermission = error.name === "AuthError" || /role cannot/i.test(error.message);

  return (
    <div className="flex min-h-96 flex-col items-center justify-center gap-4 text-center">
      <ShieldAlert className="h-9 w-9 text-[var(--text-muted)]" aria-hidden />

      <div>
        <h1 className="text-2xl">
          {isPermission ? "You do not have access to that" : "Something went wrong"}
        </h1>
        <p className="mt-1.5 max-w-md text-sm text-[var(--text-secondary)]">
          {isPermission
            ? error.message
            : "The page failed to load. Try again, and if it keeps happening check the server logs."}
        </p>
      </div>

      <div className="flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-[--radius-card] border border-[var(--border-subtle)] px-4 py-2 text-sm"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-[--radius-card] bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-contrast)]"
        >
          Back to dashboard
        </Link>
      </div>

      {error.digest ? (
        <p className="text-xs text-[var(--text-muted)]">Reference: {error.digest}</p>
      ) : null}
    </div>
  );
}
