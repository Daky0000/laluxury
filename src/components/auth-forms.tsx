"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  useTransition,
  type Ref,
} from "react";
import Link from "next/link";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import {
  loginAction,
  registerAction,
  resendSignupOtpAction,
  verifySignupAction,
  type AuthState,
} from "@/app/actions/auth";
import {
  requestPasswordResetAction,
  resendResetOtpAction,
  resetPasswordWithCodeAction,
  resetPasswordWithTokenAction,
} from "@/app/actions/password-reset";
import { Field, Alert } from "@/components/ui";
import { isValidPhone, networkOf, normalisePhone, isGhanaian } from "@/lib/phone";
import { OTP_LENGTH } from "@/lib/constants";
import { cn } from "@/lib/utils";

const submitClass =
  "mt-2 flex min-h-12 items-center justify-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50";

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

      <p className="-mt-2 text-right text-sm">
        <Link
          href="/forgot-password"
          className="text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--accent)]"
        >
          Forgotten your password?
        </Link>
      </p>

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

export type OtpBoxesHandle = { focusFirst: () => void };

/**
 * The six boxes themselves, shared by the sign-up screen and the password
 * reset. Controlled: the parent owns the digits and decides what a full code
 * does — verify itself on sign-up, wait for the new password on a reset.
 *
 * The awkward parts of a split code field are all handled explicitly, because
 * left alone every one of them behaves differently per browser: pasting a whole
 * code spreads across the boxes instead of landing in the first, autofill from
 * the SMS notification does the same, backspace in an empty box steps back and
 * clears the one before it, and the arrow keys move between boxes.
 */
export function OtpBoxes({
  ref,
  id,
  digits,
  onChange,
  disabled = false,
  invalid = false,
}: {
  ref?: Ref<OtpBoxesHandle>;
  id: string;
  digits: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
  invalid?: boolean;
}) {
  const boxes = useRef<Array<HTMLInputElement | null>>([]);

  useImperativeHandle(ref, () => ({
    focusFirst: () => boxes.current[0]?.focus(),
  }));

  function focusBox(index: number) {
    boxes.current[Math.min(Math.max(index, 0), OTP_LENGTH - 1)]?.focus();
  }

  function clearDigit(index: number) {
    onChange(digits.map((digit, i) => (i === index ? "" : digit)));
  }

  /** Writes `value` across the boxes from `start`, and returns where to go next. */
  function fill(start: number, value: string) {
    const incoming = value.replace(/[^0-9]/g, "");
    const next = [...digits];
    for (let offset = 0; offset < incoming.length && start + offset < OTP_LENGTH; offset += 1) {
      next[start + offset] = incoming[offset];
    }
    onChange(next);
    return Math.min(start + incoming.length, OTP_LENGTH - 1);
  }

  return (
    <div
      role="group"
      aria-label={`${OTP_LENGTH}-digit verification code`}
      className="flex justify-between gap-2"
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            boxes.current[index] = element;
          }}
          id={`${id}-${index}`}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          // iOS and Android offer the code from the SMS notification to a
          // run of one-character boxes only when every one of them asks.
          autoComplete="one-time-code"
          autoFocus={index === 0}
          disabled={disabled}
          aria-label={`Digit ${index + 1} of ${OTP_LENGTH}`}
          aria-invalid={invalid || undefined}
          value={digit}
          // Typing into a box that already holds a digit should replace it
          // rather than push a second character in beside it.
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => {
            const value = event.target.value.replace(/[^0-9]/g, "");
            if (!value) {
              clearDigit(index);
              return;
            }
            focusBox(fill(index, value));
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace") {
              event.preventDefault();
              if (digit) {
                clearDigit(index);
              } else if (index > 0) {
                clearDigit(index - 1);
                focusBox(index - 1);
              }
            } else if (event.key === "ArrowLeft") {
              event.preventDefault();
              focusBox(index - 1);
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              focusBox(index + 1);
            }
          }}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData("text").replace(/[^0-9]/g, "");
            if (!pasted) return;
            event.preventDefault();
            // A whole code fills from the start wherever it was dropped; a
            // fragment carries on from the box that took it.
            focusBox(fill(pasted.length >= OTP_LENGTH ? 0 : index, pasted));
          }}
          className={cn(
            "lx-field h-14 flex-1 px-0 text-center font-sans text-[1.5rem] tabular-nums",
            invalid ? "border-danger" : undefined,
          )}
        />
      ))}
    </div>
  );
}

/**
 * Six boxes, one per digit, that verify themselves.
 *
 * Every code Vynfy issues is six digits, so the screen shows exactly six boxes
 * and checks the code the instant the last one is filled — nobody has to hunt
 * for a button after typing the last digit they were already reading off a
 * text. The check is a direct call to the Server Action rather than a form
 * post, so the page never reloads.
 */
export function OtpForm({ maskedPhone, cooldown }: { maskedPhone: string; cooldown: number }) {
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [state, setState] = useState<AuthState | null>(null);
  const [verifying, startVerifying] = useTransition();
  const [wait, setWait] = useState(cooldown);
  const [resend, setResend] = useState<AuthState | null>(null);
  const [resending, setResending] = useState(false);

  const otp = useRef<OtpBoxesHandle>(null);
  /** The last code sent to the server, so the same one is not tried twice over. */
  const attempted = useRef<string | null>(null);
  const id = useId();

  const code = digits.join("");
  const complete = code.length === OTP_LENGTH;
  const busy = verifying || resending;

  function reset() {
    setDigits(Array(OTP_LENGTH).fill(""));
    attempted.current = null;
    otp.current?.focusFirst();
  }

  const verify = useCallback((value: string) => {
    attempted.current = value;
    setState(null);
    startVerifying(async () => {
      try {
        // A good code redirects from inside the action, so there is nothing to
        // handle on the way out — only the refusals come back here.
        const result = await verifySignupAction(value);
        if (result && !result.ok) {
          setState(result);
          setDigits(Array(OTP_LENGTH).fill(""));
          attempted.current = null;
        }
      } catch {
        // The request itself did not land. The code is almost certainly still
        // good, so the boxes keep it and the button below offers another go —
        // and `attempted` deliberately stays set, or a network that is down
        // would have the boxes retrying themselves in a loop.
        setState({ ok: false, message: "We could not reach us just now. Try that again." });
      }
    });
  }, []);

  // Putting the cursor back after a refusal has to wait for a render: the boxes
  // are disabled while a code is in flight, and a disabled input cannot take
  // focus, so doing it in the handler above would silently do nothing.
  useEffect(() => {
    if (state && !state.ok && !verifying) otp.current?.focusFirst();
  }, [state, verifying]);

  // The whole point of six boxes: the last digit is the submit.
  useEffect(() => {
    if (!complete || verifying) return;
    if (attempted.current === code) return;
    verify(code);
  }, [code, complete, verifying, verify]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function askAgain() {
    setResending(true);
    setResend(null);
    setState(null);
    const result = await resendSignupOtpAction();
    setResend(result);
    setResending(false);
    // A fresh code makes whatever is in the boxes stale, so they are emptied
    // ready for it. A refusal leaves them alone and starts the cooldown again.
    if (result.ok) {
      setDigits(Array(OTP_LENGTH).fill(""));
      attempted.current = null;
      otp.current?.focusFirst();
      setWait(60);
    }
  }

  const wrong = Boolean(state?.fieldErrors?.code ?? state?.message);

  return (
    <div className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field
        label="Verification code"
        htmlFor={`${id}-0`}
        required
        error={state?.fieldErrors?.code}
        hint={`Sent by text to ${maskedPhone}. It expires in 5 minutes.`}
      >
        <OtpBoxes
          ref={otp}
          id={id}
          digits={digits}
          onChange={setDigits}
          disabled={verifying}
          invalid={wrong}
        />
      </Field>

      <p aria-live="polite" className="min-h-5 text-xs text-[var(--text-muted)]">
        {verifying ? "Checking your code…" : null}
      </p>

      {/* The boxes verify themselves the moment they are full, so this is here
          for the one case they cannot cover: trying the same code again after
          the network dropped the first attempt. */}
      <button
        type="button"
        onClick={() => complete && verify(code)}
        disabled={!complete || busy}
        className={submitClass}
      >
        {verifying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Verify and continue
      </button>

      {resend?.message ? (
        <Alert tone={resend.ok ? "success" : "danger"}>{resend.message}</Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={askAgain}
          disabled={busy || wait > 0}
          className="min-h-11 text-sm text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--accent)] disabled:no-underline disabled:opacity-60"
        >
          {wait > 0 ? `Send another code in ${wait}s` : resending ? "Sending…" : "Send another code"}
        </button>

        <button
          type="button"
          onClick={reset}
          disabled={busy || code.length === 0}
          className="min-h-11 text-sm text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--accent)] disabled:no-underline disabled:opacity-60"
        >
          Clear the boxes
        </button>
      </div>
    </div>
  );
}

// --- Forgotten password -----------------------------------------------------

/** Step one: the number or email, in the same one field sign-in uses. */
export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(
    requestPasswordResetAction,
    null,
  );
  const errors = state?.fieldErrors ?? {};

  if (state?.ok) {
    return <Alert tone="success">{state.message}</Alert>;
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field
        label="Phone number or email"
        htmlFor="identifier"
        required
        error={errors.identifier}
        hint="We text a code to a phone number, or email a link to a staff address."
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

      <button type="submit" disabled={pending} className={submitClass}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Send me a code
      </button>
    </form>
  );
}

/** The two password boxes every reset ends with. */
function NewPasswordFields({
  errors,
  password,
  onPassword,
  confirm,
  onConfirm,
}: {
  errors: Record<string, string>;
  password: string;
  onPassword: (next: string) => void;
  confirm: string;
  onConfirm: (next: string) => void;
}) {
  const mismatch = confirm.length > 0 && confirm !== password;

  return (
    <>
      <PasswordField
        id="password"
        name="password"
        label="New password"
        autoComplete="new-password"
        error={errors.password}
        value={password}
        onChange={onPassword}
      >
        <StrengthMeter password={password} />
      </PasswordField>

      <PasswordField
        id="confirmPassword"
        name="confirmPassword"
        label="Confirm new password"
        autoComplete="new-password"
        error={errors.confirmPassword ?? (mismatch ? "Those two passwords do not match." : undefined)}
        value={confirm}
        onChange={onConfirm}
      />
    </>
  );
}

/**
 * Step two by text: the code and the new password on one screen.
 *
 * Unlike sign-up the boxes do not submit themselves — there is a password still
 * to type — so the code travels as a hidden field with the rest of the form.
 */
export function ResetWithCodeForm({
  maskedPhone,
  cooldown,
}: {
  maskedPhone: string;
  cooldown: number;
}) {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(
    resetPasswordWithCodeAction,
    null,
  );
  const [digits, setDigits] = useState<string[]>(() => Array(OTP_LENGTH).fill(""));
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [wait, setWait] = useState(cooldown);
  const [resend, setResend] = useState<AuthState | null>(null);
  const [resending, setResending] = useState(false);
  const otp = useRef<OtpBoxesHandle>(null);
  const id = useId();

  const code = digits.join("");
  const errors = state?.fieldErrors ?? {};

  useEffect(() => {
    if (wait <= 0) return;
    const timer = setTimeout(() => setWait((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  async function askAgain() {
    setResending(true);
    setResend(null);
    const result = await resendResetOtpAction();
    setResend(result);
    setResending(false);
    if (result.ok) {
      setDigits(Array(OTP_LENGTH).fill(""));
      otp.current?.focusFirst();
      setWait(60);
    }
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field
        label="Verification code"
        htmlFor={`${id}-0`}
        required
        error={errors.code}
        hint={`Sent by text to ${maskedPhone}. It expires in 5 minutes.`}
      >
        <OtpBoxes
          ref={otp}
          id={id}
          digits={digits}
          onChange={setDigits}
          disabled={pending}
          invalid={Boolean(errors.code)}
        />
      </Field>
      <input type="hidden" name="code" value={code} />

      <NewPasswordFields
        errors={errors}
        password={password}
        onPassword={setPassword}
        confirm={confirm}
        onConfirm={setConfirm}
      />

      <button
        type="submit"
        disabled={pending || code.length !== OTP_LENGTH || !password || !confirm}
        className={submitClass}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Set new password
      </button>

      {resend?.message ? (
        <Alert tone={resend.ok ? "success" : "danger"}>{resend.message}</Alert>
      ) : null}

      <button
        type="button"
        onClick={askAgain}
        disabled={pending || resending || wait > 0}
        className="min-h-11 self-start text-sm text-[var(--text-secondary)] underline underline-offset-4 transition-colors hover:text-[var(--accent)] disabled:no-underline disabled:opacity-60"
      >
        {wait > 0 ? `Send another code in ${wait}s` : resending ? "Sending…" : "Send another code"}
      </button>
    </form>
  );
}

/** Step two by email: the token from the link rides along hidden. */
export function ResetWithTokenForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AuthState | null, FormData>(
    resetPasswordWithTokenAction,
    null,
  );
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const errors = state?.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <input type="hidden" name="token" value={token} />

      <NewPasswordFields
        errors={errors}
        password={password}
        onPassword={setPassword}
        confirm={confirm}
        onConfirm={setConfirm}
      />

      <button
        type="submit"
        disabled={pending || !password || !confirm}
        className={submitClass}
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        Set new password
      </button>
    </form>
  );
}
