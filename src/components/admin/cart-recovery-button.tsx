"use client";

import { useState, useTransition } from "react";
import { Loader2, Mail, Smartphone } from "lucide-react";
import { sendCartRecoveryAction } from "@/app/actions/admin/messages";


export function CartRecoveryButton({
  cartId,
  phone,
  email,
  lastSentAt,
}: {
  cartId: string;
  phone: string | null;
  email: string | null;
  lastSentAt?: Date | string | null;
}) {
  const [sendingSms, startSms] = useTransition();
  const [sendingEmail, startEmail] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSend = (channel: "sms" | "email") => {
    setFeedback(null);
    const runner = channel === "sms" ? startSms : startEmail;

    runner(async () => {
      const res = await sendCartRecoveryAction(cartId, {
        sendSms: channel === "sms",
        sendEmail: channel === "email",
      });

      setIsSuccess(res.ok);
      setFeedback(res.message || (res.ok ? `${channel.toUpperCase()} recovery sent!` : "Failed to send"));
      setTimeout(() => setFeedback(null), 4000);
    });
  };

  return (
    <div className="flex flex-col gap-1 items-end">
      <div className="flex flex-wrap items-center gap-1.5">
        {phone ? (
          <button
            type="button"
            disabled={sendingSms}
            onClick={() => handleSend("sms")}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors shadow-2xs"
            title="Dispatch 5% courtesy code SMS recovery message"
          >
            {sendingSms ? <Loader2 className="h-3 w-3 animate-spin" /> : <Smartphone className="h-3 w-3 text-emerald-600" />}
            <span>Send SMS</span>
          </button>
        ) : null}

        {email ? (
          <button
            type="button"
            disabled={sendingEmail}
            onClick={() => handleSend("email")}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors shadow-2xs"
            title="Dispatch 5% courtesy code email recovery message"
          >
            {sendingEmail ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mail className="h-3 w-3 text-sky-600" />}
            <span>Send Email</span>
          </button>
        ) : null}
      </div>

      {feedback ? (
        <span className={`text-[10px] ${isSuccess ? "text-emerald-600 font-medium" : "text-danger"}`}>
          {feedback}
        </span>
      ) : lastSentAt ? (
        <span className="text-[10px] text-[var(--text-muted)]">
          Recovery notice sent previously
        </span>
      ) : null}
    </div>
  );
}
