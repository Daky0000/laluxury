"use client";

import { useActionState, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  loginAction,
  registerAction,
  resendSignupOtpAction,
  verifySignupAction,
  type AuthState,
} from "@/app/actions/auth";
import { Field, Alert } from "@/components/ui";
import { isValidPhone, networkOf, normalisePhone, isGhanaian } from "@/lib/phone";
import { cn } from "@/lib/utils";

const submitClass =
  "mt-2 flex min-h-12 items-center justify-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-3 text-sm text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50";

// --- Password ---------------------------------------------------------------

/**
 * A password box with a reveal toggle.
 *
 * The toggle is a button rather than a checkbox so it can sit inside the field,
 * and it says what it will do rather than what state it is in — a screen reader
 * announcing "hide password" on a hidden password is the usual way this control
 * gets it wrong.
 */
function PasswordField({
  id,
  name,
  label,
  autoComplete,
  required = true,
  error,
  hint,
  value,
  onChange,
  children,
}: {
  id: string;
  name: string;
  label: string;
  autoComplete: string;
  required?: boolean;
  error?: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  /** The strength meter, where there is one. */
  children?: React.ReactNode;
}) {
  const [shown, setShown] = useState(false);

  return (
    <Field label={label} htmlFor={id} required={required} error={error} hint={hint}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={shown ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="lx-field pr-12"
        />
        <button
          type="button"
          onClick={() => setShown((previous) => !previous)}
          // Not in the tab order: it is a convenience beside the field, and
          // stopping between the password and the next box to skip past a
          // show/hide toggle is worse than reaching for it with the mouse.
          tabIndex={-1}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
        >
          {shown ? (
            <EyeOff className="h-4 w-4" aria-hidden />
          ) : (
            <Eye className="h-4 w-4" aria-hidden />
          )}
          <span className="sr-only">{shown ? "Hide password" : "Show password"}</span>
        </button>
      </div>
      {children}
    </Field>
  );
}

const STRENGTH_LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_COLOURS = [
  "bg-[var(--border-strong)]",
  "bg-danger",
  "bg-warning",
  "bg-sage-600",
  "bg-success",
] as const;

/**
 * Scores a password out of four.
 *
 * The floor mirrors `passwordProblems` on the server — eight characters, upper,
 * lower and a number — so the meter cannot call something "Good" that the
 * server will then reject. Length beyond the minimum is what earns the fourth
 * bar, because length is what actually costs an attacker time.
 */
function strengthOf(password: string): { score: number; hints: string[] } {
  if (!password) return { score: 0, hints: [] };

  const hints: string[] = [];
  if (password.length < 8) hints.push("at least 8 characters");
  if (!/[a-z]/.test(password)) hints.push("a lowercase letter");
  if (!/[A-Z]/.test(password)) hints.push("a capital");
  if (!/[0-9]/.test(password)) hints.push("a number");

  if (hints.length > 0) return { score: password.length >= 6 ? 1 : 0, hints };

  let score = 2;
  if (password.length >= 12) score += 1;
  if (password.length >= 16 || /[^A-Za-z0-9]/.test(password)) score += 1;

  return { score: Math.min(score, 4), hints: [] };
}

function StrengthMeter({ password }: { password: string }) {
  const { score, hints } = useMemo(() => strengthOf(password), [password]);
  if (!password) return null;

  return (
    <div className="mt-2">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              step <= score ? STRENGTH_COLOURS[score] : "bg-[var(--surface-sunken)]",
            )}
          />
        ))}
      </div>
      <p aria-live="polite" className="mt-1.5 text-xs text-[var(--text-muted)]">
        {STRENGTH_LABELS[score]}
        {hints.length > 0 ? ` — still needs ${hints.join(", ")}.` : "."}
      </p>
    </div>
  );
}

// --- Sign in ----------------------------------------------------------------

export function LoginForm() {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(loginAction, null);
  const [password, setPassword] = useState("");
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field
        label="Phone number or email"
        htmlFor="identifier"
        required
        error={errors.identifier}
        hint="The number you signed up with — 024 000 0000, or with its country code."
      >
        <input
          id="identifier"
          name="identifier"
          type="text"
          inputMode="tel"
          required
          autoComplete="username"
          autoFocus
          className="lx-field"
        />
      </Field>

      <PasswordField
        id="password"
        name="password"
        label="Password"
        autoComplete="current-password"
        error={errors.password}
        value={password}
        onChange={setPassword}
      />

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Sign in
      </button>
    </form>
  );
}

// --- Create an account ------------------------------------------------------

/**
 * What to say back about the number as it is typed.
 *
 * Naming the network, or the country code we resolved it to, tells someone they
 * got their own number right before they sit waiting on a text that was never
 * going to arrive. Silent until there is enough typed to say anything useful.
 */
function readBack(phone: string): string | null {
  if (phone.replace(/[^0-9]/g, "").length < 6) return null;

  const canonical = normalisePhone(phone);
  if (!canonical) return null;
  if (!isGhanaian(canonical)) return `+${canonical}`;

  return networkOf(canonical);
}

export function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(registerAction, null);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const errors = state?.fieldErrors ?? {};

  const read = readBack(phone);
  const unreadable = phone.trim().length > 0 && !isValidPhone(phone);
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field label="Name" htmlFor="name" required error={errors.name}>
        <input
          id="name"
          name="name"
          required
          autoComplete="name"
          autoFocus
          placeholder="Ama Mensah"
          className="lx-field"
        />
      </Field>

      <Field
        label="Phone number"
        htmlFor="phone"
        required
        error={
          errors.phone ??
          (unreadable
            ? "Add the country code if you are outside Ghana, e.g. +44 7700 900123."
            : undefined)
        }
        hint={
          read
            ? `${read} — we will text a code to confirm it.`
            : "A Ghanaian number, or any other with its country code. We text a code to confirm it."
        }
      >
        <input
          id="phone"
          name="phone"
          type="tel"
          inputMode="tel"
          required
          autoComplete="tel"
          placeholder="024 000 0000 or +44 7700 900123"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="lx-field"
        />
      </Field>

      <PasswordField
        id="password"
        name="password"
        label="Password"
        autoComplete="new-password"
        error={errors.password}
        value={password}
        onChange={setPassword}
      >
        <StrengthMeter password={password} />
      </PasswordField>

      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm password"
        autoComplete="new-password"
        error={errors.confirmPassword ?? (mismatch ? "Those two passwords do not match." : undefined)}
        value={confirm}
        onChange={setConfirm}
      />

      <label className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
        <input type="checkbox" name="acceptsMarketing" className="mt-0.5 accent-[var(--accent)]" />
        Text and email me about new arrivals. No more than twice a month, and you can stop any time.
      </label>

      <p className="text-sm font-light leading-relaxed text-[var(--text-muted)]">
        Creating an account means you accept our{" "}
        <Link href="/terms" className="underline underline-offset-4 hover:text-[var(--accent)]">
          terms of sale
        </Link>{" "}
        and that you have read the{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-[var(--accent)]">
          privacy notice
        </Link>
        .
      </p>

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Send me a code
      </button>
    </form>
  );
}

// --- The code ---------------------------------------------------------------

/**
 * One box rather than six.
 *
 * Six single-character inputs look the part and then fight the phone: paste
 * lands in the first box, autofill fills the first box, and backspace behaves
 * differently in every browser. A single field with `autocomplete="one-time-code"`
 * is what iOS and Android actually offer to fill from the SMS notification.
 */
export function OtpForm({ maskedPhone, cooldown }: { maskedPhone: string; cooldown: number }) {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(
    verifySignupAction,
    null,
  );
  const [code, setCode] = useState("");
  const [wait, setWait] = useState(cooldown);
  const [resend, setResend] = useState<AuthState | null>(null);
  const [resending, setResending] = useState(false);
  const id = useId();
  const errors = state?.fieldErrors ?? {};

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function askAgain() {
    setResending(true);
    setResend(null);
    const result = await resendSignupOtpAction();
    setResend(result);
    setResending(false);
    if (result.ok) setWait(60);
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={action} className="flex flex-col gap-4">
        {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

        <Field
          label="Verification code"
          htmlFor={id}
          required
          error={errors.code}
          hint={`Sent by text to ${maskedPhone}. It expires in 5 minutes.`}
        >
          <input
            id={id}
            name="code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={8}
            required
            autoFocus
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^0-9]/g, ""))}
            className="lx-field text-center font-sans text-[1.75rem] tracking-[0.4em]"
          />
        </Field>

        <button type="submit" disabled={pending || code.length < 4} className={submitClass}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Verify and continue
        </button>
      </form>

      {resend?.message ? (
        <Alert tone={resend.ok ? "success" : "danger"}>{resend.message}</Alert>
      ) : null}

      <button
        type="button"
        onClick={askAgain}
        disabled={resending || wait > 0}
        className="min-h-11 text-sm text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--accent)] disabled:no-underline disabled:opacity-60"
      >
        {wait > 0 ? `Send another code in ${wait}s` : resending ? "Sending…" : "Send another code"}
      </button>
    </div>
  );
}
