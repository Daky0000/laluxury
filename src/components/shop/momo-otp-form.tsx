"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { customerSubmitMomoOtpAction } from "@/app/actions/order-pay";

/**
 * Some networks need a code before the MoMo prompt appears: Telecel asks for
 * a voucher the payer generates on *110#, and other networks now and then
 * text a one-time code. Paystack holds the charge until that code comes back,
 * so without this field the payer never sees a prompt at all.
 */
export function MomoOtpForm({
  orderId,
  token,
  reference,
  required,
  network,
}: {
  orderId: string;
  /** The order access token the page was opened with. */
  token: string;
  reference: string;
  /** Paystack asked for a code (charge status `send_otp`). */
  required: boolean;
  network?: "mtn" | "vod" | "atl" | null;
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
      const res = await customerSubmitMomoOtpAction({ orderId, token, reference, otp: code });
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
        {required
          ? network === "vod"
            ? "Enter your Telecel Cash voucher code"
            : "Enter the code from your network"
          : "Asked for a code or voucher?"}
      </label>
      <p className="mt-1 text-[var(--text-secondary)]">
        {required
          ? network === "vod"
            ? "Dial *110#, generate a voucher with your PIN, then type the voucher here."
            : "Type the code your network sent you. The payment prompt follows."
          : "If your network sent a code, or Telecel asked you to generate a voucher on *110#, enter it here."}
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
