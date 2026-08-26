"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { contactAction, type SimpleState } from "@/app/actions/misc";
import { Alert } from "@/components/ui";

/**
 * The "Send us a message" card from the contact artboard: name and email side
 * by side, a subject the shopper picks rather than types, then the message.
 */

const SUBJECTS = [
  "Order status",
  "Returns & exchange",
  "Sizing help",
  "Wholesale / bulk",
  "Something else",
];

const field =
  "w-full border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-3.5 text-sm " +
  "outline-none transition-colors placeholder:text-ink-400 focus:border-[var(--accent)]";

export function ContactForm() {
  const [state, action, pending] = useActionState<SimpleState | null, FormData>(
    contactAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col">
      <h2 className="mb-6 text-[clamp(1.6rem,3vw,2rem)]">Send us a message</h2>

      {state?.message && !state.ok ? (
        <div className="mb-4">
          <Alert tone="danger">{state.message}</Alert>
        </div>
      ) : null}

      <div className="grid gap-3.5 sm:grid-cols-2">
        <label htmlFor="name" className="sr-only">
          Full name
        </label>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          placeholder="Full name"
          className={field}
        />

        <label htmlFor="email" className="sr-only">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="Email address"
          className={field}
        />

        <label htmlFor="subject" className="sr-only">
          What is this about?
        </label>
        <select id="subject" name="subject" defaultValue="" className={`${field} cursor-pointer sm:col-span-2`}>
          <option value="">What&rsquo;s this about?</option>
          {SUBJECTS.map((subject) => (
            <option key={subject} value={subject}>
              {subject}
            </option>
          ))}
        </select>

        <label htmlFor="message" className="sr-only">
          Your message
        </label>
        <textarea
          id="message"
          name="message"
          rows={5}
          required
          placeholder="Your message"
          className={`${field} resize-y sm:col-span-2`}
        />
      </div>

      <div className="mt-4.5 flex flex-wrap items-center gap-4">
        <button type="submit" disabled={pending} className="lx-cta disabled:opacity-60">
          {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
          Send message
        </button>

        {state?.ok ? (
          <p role="status" className="text-[13px] text-sage-600">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
