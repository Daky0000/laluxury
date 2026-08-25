"use client";

import { useActionState } from "react";
import { subscribeAction, type SimpleState } from "@/app/actions/misc";

export function NewsletterForm() {
  const [state, action, pending] = useActionState<SimpleState | null, FormData>(
    subscribeAction,
    null,
  );

  if (state?.ok) {
    return <p className="text-sm text-success">{state.message}</p>;
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
        className="lx-field flex-1"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-[--radius-card] bg-[var(--accent)] px-4 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
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
