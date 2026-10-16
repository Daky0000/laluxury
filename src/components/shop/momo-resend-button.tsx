"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendCheckoutPromptAction } from "@/app/actions/order-pay";

/**
 * "Send the prompt again" on the confirmation page. A MoMo prompt lasts about
 * a minute and is easy to miss; this repeats it to the same wallet and moves
 * the page onto the new attempt.
 */
export function MomoResendButton({ reference, token }: { reference: string; token: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function resend() {
    setError(null);
    startTransition(async () => {
      const res = await resendCheckoutPromptAction(reference, token);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.replace(`/checkout/confirm?reference=${encodeURIComponent(res.reference)}&t=${encodeURIComponent(token)}`);
    });
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={resend}
        disabled={pending}
        className="border border-[var(--accent)] px-5 py-2.5 text-sm font-medium uppercase tracking-[0.12em] text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-50"
      >
        {pending ? "Sending…" : "Send the prompt again"}
      </button>
      {error ? (
        <p role="alert" className="mt-2 text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
