import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { cooldownRemaining, getPendingSignup } from "@/lib/auth/signup";
import { cancelSignupAction } from "@/app/actions/auth";
import { maskPhone } from "@/lib/phone";
import { OtpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Confirm your number", robots: { index: false } };

/**
 * Step two of registration.
 *
 * Reachable only with the short-lived sign-up cookie in hand — landing here
 * without one means the attempt lapsed, so it starts over rather than showing a
 * code box that could never verify anything.
 */
export default async function VerifyPage() {
  const user = await currentUser();
  if (user) redirect("/account");

  const pending = await getPendingSignup();
  if (!pending) redirect("/register");

  return (
    <div className="w-full max-w-md">
      <h1 className="text-3xl">Confirm your number</h1>
      <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
        We have texted a 6-digit code to <strong>{maskPhone(pending.phone)}</strong>. Type it in to
        finish setting up your account.
      </p>

      <div className="mt-8">
        <OtpForm
          maskedPhone={maskPhone(pending.phone)}
          cooldown={cooldownRemaining(pending.sentAt)}
        />
      </div>

      <form action={cancelSignupAction} className="mt-6">
        <button
          type="submit"
          className="text-sm text-[var(--text-secondary)] underline underline-offset-4 hover:text-[var(--accent)]"
        >
          Use a different number
        </button>
      </form>
    </div>
  );
}
