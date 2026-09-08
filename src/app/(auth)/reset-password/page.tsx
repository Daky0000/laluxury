import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getPendingReset, peekResetToken } from "@/lib/auth/reset";
import { cooldownRemaining } from "@/lib/auth/signup";
import { cancelResetAction } from "@/app/actions/password-reset";
import { maskPhone } from "@/lib/phone";
import { OTP_LENGTH } from "@/lib/constants";
import { ResetWithCodeForm, ResetWithTokenForm } from "@/components/auth-forms";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/**
 * Step two of a reset, in whichever form step one took.
 *
 * With `?token=` in the address this is the end of an emailed link; without it
 * the reset cookie says a code was texted. Neither in hand means the attempt
 * lapsed, and it starts over rather than showing a form that cannot succeed.
 */
export default async function ResetPasswordPage({ searchParams }: PageProps<"/reset-password">) {
  const user = await currentUser();
  if (user) redirect("/account");

  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";

  if (token) {
    const valid = await peekResetToken(token);
    return (
      <div className="w-full max-w-sm">
        <h1 className="text-3xl">Choose a new password</h1>
        {valid ? (
          <>
            <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
              Pick something you have not used elsewhere. You will be signed in straight after.
            </p>
            <div className="mt-8">
              <ResetWithTokenForm token={token} />
            </div>
          </>
        ) : (
          <>
            <div className="mt-6">
              <Alert tone="danger">
                That reset link has expired or has already been used. Ask for a new one.
              </Alert>
            </div>
            <p className="mt-6 text-sm">
              <Link href="/forgot-password" className="underline underline-offset-4">
                Start again
              </Link>
            </p>
          </>
        )}
      </div>
    );
  }

  const pending = await getPendingReset();
  if (!pending) redirect("/forgot-password");

  return (
    <div className="w-full max-w-md">
      <h1 className="text-3xl">Choose a new password</h1>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        We have texted a {OTP_LENGTH}-digit code to <strong>{maskPhone(pending.phone)}</strong>.
        Type it in with your new password.
      </p>

      {!pending.delivered ? (
        <div className="mt-6">
          <Alert tone="warning">
            Our SMS network did not confirm that send. The code may still arrive - give it a
            moment, and use &ldquo;Send another code&rdquo; below if it does not.
          </Alert>
        </div>
      ) : null}

      <div className="mt-8">
        <ResetWithCodeForm
          maskedPhone={maskPhone(pending.phone)}
          cooldown={cooldownRemaining(pending.sentAt)}
        />
      </div>

      <form action={cancelResetAction} className="mt-6">
        <button
          type="submit"
          className="text-sm text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--accent)]"
        >
          Use a different number or email
        </button>
      </form>
    </div>
  );
}
