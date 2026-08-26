"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { loginAction, registerAction, type AuthState } from "@/app/actions/auth";
import { Field, Alert } from "@/components/ui";

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(loginAction, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field label="Email" htmlFor="email" required error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          autoFocus
          className="lx-field"
        />
      </Field>

      <Field label="Password" htmlFor="password" required error={errors.password}>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="lx-field"
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex items-center justify-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-3 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Sign in
      </button>
    </form>
  );
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(registerAction, null);
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="firstName" required error={errors.firstName}>
          <input
            id="firstName"
            name="firstName"
            required
            autoComplete="given-name"
            className="lx-field"
          />
        </Field>

        <Field label="Last name" htmlFor="lastName" required error={errors.lastName}>
          <input
            id="lastName"
            name="lastName"
            required
            autoComplete="family-name"
            className="lx-field"
          />
        </Field>
      </div>

      <Field label="Email" htmlFor="email" required error={errors.email}>
        <input id="email" name="email" type="email" required autoComplete="email" className="lx-field" />
      </Field>

      <Field label="Phone" htmlFor="phone" hint="Optional, for delivery updates.">
        <input id="phone" name="phone" type="tel" autoComplete="tel" className="lx-field" />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        required
        error={errors.password}
        hint="At least 8 characters, with a number and a capital."
      >
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="lx-field"
        />
      </Field>

      <label className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" name="acceptsMarketing" className="mt-0.5 accent-[var(--accent)]" />
        Email me about new arrivals. No more than twice a month.
      </label>

      <button
        type="submit"
        disabled={pending}
        className="mt-2 flex items-center justify-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-3 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Create account
      </button>
    </form>
  );
}
