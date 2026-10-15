"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { customerSubmitMomoOtpAction } from "@/app/actions/order-pay";

/**
 * Some networks (Telecel always, MTN now and then) text a code before the
 * MoMo PIN prompt appears. Paystack holds the charge until that code comes
 * back, so without this field the shopper never sees a prompt at all.
 */
export function MomoOtpForm({
  orderId,
  reference,
  required,
}: {
  orderId: string;
  reference: string;
  /** Paystack asked for a code when the charge started. */
  required: boolean;
}) {
  const router = useRouter();
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const code = otp.trim();
    if (!code) return;
    startTransition(async () => {
      const res = await customerSubmitMomoOtpAction({ orderId, reference, otp: code });
      if (!res.ok) {
        setMessage({ tone: "error", text: res.error ?? "That code was not accepted. Check it and try again." });
        return;
      }
      setOtp("");
      setMessage({
        tone: "ok",
        text:
          res.displayText ??
          "Code accepted. Approve the payment prompt on your phone with your MoMo PIN.",
      });
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="mt-4 border-t border-[var(--border-subtle)] pt-4">
      <label htmlFor="momo-otp" className="block text-sm font-medium text-[var(--text-primary)]">
        {required ? "Enter the code sent to your phone" : "Received a code by SMS?"}
      </label>
      <p className="mt-1 text-[var(--text-secondary)]">
        {required
          ? "Your network sent a one-time code. Enter it here and the PIN prompt will appear on your phone."
          : "Telecel Cash and some MTN wallets send a code first. Enter it here to receive the PIN prompt."}
      </p>
      <div className="mt-3 flex gap-2">
        <input
          id="momo-otp"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={otp}
          onChange={(e) => setOtp(e.target.value)}
          placeholder="Code"
          className="min-w-0 flex-1 border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3 py-2.5 text-base"
        />
        <button
          type="submit"
          disabled={pending || !otp.trim()}
          className="shrink-0 border border-[var(--accent)] bg-[var(--accent)] px-5 py-2.5 text-sm font-medium uppercase tracking-[0.12em] text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? "Sending…" : "Submit"}
        </button>
      </div>
      {message ? (
        <p className={`mt-2 ${message.tone === "error" ? "text-danger" : "text-sage-600"}`} role="status">
          {message.text}
        </p>
      ) : null}
    </form>
  );
}
