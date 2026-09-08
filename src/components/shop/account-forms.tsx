"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import {
  changePasswordAction,
  updateAccountDetailsAction,
  type AccountState,
} from "@/app/actions/account";
import { Alert, Field } from "@/components/ui";

/**
 * The two small forms on the account page: who you are, and your password.
 * Each saves on its own button so a typo in one cannot undo the other.
 */

const button =
  "inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-(--radius-card) bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50";

export function AccountDetailsForm({
  firstName,
  lastName,
  email,
  emailRequired,
}: {
  firstName: string;
  lastName: string;
  email: string;
  /** Staff sign in by email, so theirs cannot be blanked. */
  emailRequired: boolean;
}) {
  const [state, action, pending] = useActionState<AccountState | null, FormData>(
    updateAccountDetailsAction,
    null,
  );
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="account-first" required error={errors.firstName}>
          <input
            id="account-first"
            name="firstName"
            required
            defaultValue={firstName}
            autoComplete="given-name"
            className="lx-field"
          />
        </Field>
        <Field label="Last name" htmlFor="account-last" error={errors.lastName}>
          <input
            id="account-last"
            name="lastName"
            defaultValue={lastName}
            autoComplete="family-name"
            className="lx-field"
          />
        </Field>
      </div>

      <Field
        label="Email"
        htmlFor="account-email"
        required={emailRequired}
        error={errors.email}
        hint="Receipts and order updates are emailed here as well as texted."
      >
        <input
          id="account-email"
          name="email"
          type="email"
          required={emailRequired}
          defaultValue={email}
          autoComplete="email"
          className="lx-field"
        />
      </Field>

      <button type="submit" disabled={pending} className={button}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Save details
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState<AccountState | null, FormData>(
    changePasswordAction,
    null,
  );
  const errors = state?.fieldErrors ?? {};

  return (
    <form
      action={action}
      // Cleared on success by remounting, so the old passwords are not left
      // sitting in the boxes after they have been changed.
      key={state?.ok ? "done" : "editing"}
      className="flex flex-col gap-4"
    >
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <Field label="Current password" htmlFor="pw-current" required error={errors.current}>
        <input
          id="pw-current"
          name="current"
          type="password"
          required
          autoComplete="current-password"
          className="lx-field"
        />
      </Field>

      <Field
        label="New password"
        htmlFor="pw-new"
        required
        error={errors.password}
        hint="At least 8 characters, with a capital letter and a number."
      >
        <input
          id="pw-new"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className="lx-field"
        />
      </Field>

      <Field label="Confirm new password" htmlFor="pw-confirm" required error={errors.confirmPassword}>
        <input
          id="pw-confirm"
          name="confirmPassword"
          type="password"
          required
          autoComplete="new-password"
          className="lx-field"
        />
      </Field>

      <button type="submit" disabled={pending} className={button}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Change password
      </button>
    </form>
  );
}
