"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { contactAction, type SimpleState } from "@/app/actions/misc";
import { Field, Alert } from "@/components/ui";

export function ContactForm() {
  const [state, action, pending] = useActionState<SimpleState | null, FormData>(
    contactAction,
    null,
  );

  if (state?.ok) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Your name" htmlFor="name" required>
          <input id="name" name="name" required autoComplete="name" className="lx-field" />
        </Field>

        <Field label="Email" htmlFor="email" required>
          <input
            id="email"
            name="email"
            type="email"
            required
            autoComplete="email"
            className="lx-field"
          />
        </Field>

        <Field label="Phone" htmlFor="phone">
          <input id="phone" name="phone" type="tel" autoComplete="tel" className="lx-field" />
        </Field>

        <Field label="Subject" htmlFor="subject">
          <input id="subject" name="subject" className="lx-field" />
        </Field>
      </div>

      <Field label="Message" htmlFor="message" required>
        <textarea id="message" name="message" rows={6} required className="lx-field resize-y" />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="flex w-fit items-center gap-2 rounded-[--radius-card] bg-[var(--accent)] px-6 py-3 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Send message
      </button>
    </form>
  );
}
