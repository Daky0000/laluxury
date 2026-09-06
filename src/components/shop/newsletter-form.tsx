"use client";

import { useActionState } from "react";
import { subscribeAction, type SimpleState } from "@/app/actions/misc";

/**
 * `inline` is the joined input + wine button from the home page artboard;
 * `compact` is the smaller pairing used anywhere the form sits in a column.
 */
export function NewsletterForm({ variant = "compact" }: { variant?: "compact" | "inline" }) {
  const [state, action, pending] = useActionState<SimpleState | null, FormData>(
    subscribeAction,
    null,
  );

  if (state?.ok) {
    return <p className="text-sm text-success">{state.message}</p>;
  }

  if (variant === "inline") {
    return (
      <form action={action} className="mx-auto max-w-[460px]">
        {/* `min-w-0` on the input is load-bearing: a text input carries an
            intrinsic minimum width of about twenty characters, and without this
            a flex row refuses to shrink it, so on a narrow phone the button was
            pushed past the edge of the screen. */}
        <div className="flex border border-[var(--border-strong)] bg-[var(--surface-raised)]">
          <label htmlFor="newsletter-email" className="sr-only">
            Email address
          </label>
          <input
            id="newsletter-email"
            name="email"
            type="email"
            required
            placeholder="Your email address"
            className="min-w-0 flex-1 bg-transparent px-4 py-4 text-sm outline-none placeholder:text-[var(--text-muted)] sm:px-5"
          />
          <button
            type="submit"
            disabled={pending}
            className="shrink-0 bg-[var(--accent)] px-4 text-sm font-medium uppercase tracking-[0.08em] text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-60 sm:px-7 sm:tracking-[0.12em]"
          >
            {pending ? "…" : "Subscribe"}
          </button>
        </div>

        {state?.message && !state.ok ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {state.message}
          </p>
        ) : null}
      </form>
    );
  }

  return (
    <form action={action} className="flex gap-2">
      <label htmlFor="newsletter-email" className="sr-only">
        Email address
      </label>
      <input
        id="newsletter-email"
        name="email"
        type="email"
        required
        placeholder="you@example.com"
        className="lx-field min-w-0 flex-1"
      />
      <button
        type="submit"
        disabled={pending}
        className="shrink-0 bg-[var(--accent)] px-4 text-sm text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
      >
        {pending ? "..." : "Join"}
      </button>
      {state?.message && !state.ok ? (
        <p role="alert" className="sr-only">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
