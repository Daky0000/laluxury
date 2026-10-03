"use client";

import Link from "next/link";
import { ShieldAlert, Database } from "lucide-react";

/**
 * Catches permission failures from `requirePermission` or database connection
 * downtime, giving clear guidance on what to do rather than an ambiguous error.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isPermission = error.name === "AuthError" || /role cannot/i.test(error.message);
  const isDbDown =
    /database is currently offline|ECONNREFUSED|connect_timeout|database|prisma/i.test(
      error.message
    ) || (Boolean(error.digest) && !isPermission);

  if (isDbDown && !isPermission) {
    return (
      <div className="flex min-h-96 flex-col items-center justify-center gap-4 text-center p-6">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-amber-500/10 text-amber-600">
          <Database className="h-6 w-6" aria-hidden />
        </div>

        <div className="max-w-md">
          <h1 className="text-xl font-bold text-[var(--text-primary)]">
            Database Offline or Reconnecting
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
            The service is temporarily reconnecting to the database. Please click <strong>Retry Connection</strong> below.
          </p>
          {process.env.NODE_ENV !== "production" ? (
            <div className="mt-4 rounded-lg bg-[var(--surface-sunken)] p-3 text-left font-mono text-xs text-[var(--text-muted)]">
              <span className="block text-[10px] text-[var(--text-muted)] mb-1">Local dev command:</span>
              <code>docker start nobleenclave-pg</code>
            </div>
          ) : null}
        </div>

        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-(--radius-card) bg-[var(--accent)] px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-white shadow-xs hover:opacity-90 transition-opacity"
          >
            Retry Connection
          </button>
          <Link
            href="/admin"
            className="rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-2.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            Reload Page
          </Link>
        </div>

        {error.digest ? (
          <p className="text-[11px] text-[var(--text-muted)]">Reference ID: {error.digest}</p>
        ) : null}
      </div>
    );
  }

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
          className="rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-2 text-sm"
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-contrast)]"
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
