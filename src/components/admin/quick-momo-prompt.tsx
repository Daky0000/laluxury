"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, CheckCircle2, Loader2, RefreshCw, Send, X } from "lucide-react";
import {
  initiateMomoPinPushAction,
  submitMomoPushOtpAction,
  checkOrConfirmMomoPinAction,
} from "@/app/actions/admin/momo-push";
import type { MomoPushResult } from "@/lib/momo-push";
import { formatMoney } from "@/lib/money";
import type { MomoProvider } from "@/lib/paystack";

export function QuickMomoPromptButton({
  orderId,
  orderNumber,
  customerName,
  defaultPhone,
  totalMinor,
  depositMinor,
}: {
  orderId: string;
  orderNumber: string;
  customerName?: string;
  defaultPhone: string;
  totalMinor: number;
  depositMinor: number | null;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [phone, setPhone] = useState(defaultPhone);
  const [provider, setProvider] = useState<"auto" | MomoProvider>("auto");
  const [chargeScope, setChargeScope] = useState<"FULL" | "DEPOSIT_50">("FULL");

  const [pushState, setPushState] = useState<MomoPushResult | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmedPaid, setConfirmedPaid] = useState(false);
  const [isPending, startTransition] = useTransition();

  const depositVal = depositMinor ?? Math.round(totalMinor * 0.5);
  const selectedAmountMinor = chargeScope === "DEPOSIT_50" ? depositVal : totalMinor;

  // Poll every 4.5s while waiting for customer PIN entry
  useEffect(() => {
    if (!isOpen || !pushState?.ok || !pushState.reference || confirmedPaid) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 25;

    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        setStatusMessage(
          "Polling timed out. Click 'Check PIN Status Now' once the customer confirms entering their PIN.",
        );
        return;
      }

      const check = await checkOrConfirmMomoPinAction({
        orderId,
        reference: pushState.reference!,
        chargeScope,
      });

      if (check.paid) {
        setConfirmedPaid(true);
        setStatusMessage(check.message);
        router.refresh();
      }
    }, 4500);

    return () => clearInterval(timer);
  }, [isOpen, pushState, confirmedPaid, orderId, chargeScope, router]);

  function handleSendPush(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);
    setConfirmedPaid(false);

    startTransition(async () => {
      const res = await initiateMomoPinPushAction({
        orderId,
        phone,
        provider,
        chargeScope,
      });
      setPushState(res);
      if (res.status === "success") {
        setConfirmedPaid(true);
        router.refresh();
      }
    });
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pushState?.reference || !otpCode.trim()) return;

    startTransition(async () => {
      const res = await submitMomoPushOtpAction({
        orderId,
        reference: pushState.reference!,
        otp: otpCode,
      });
      setPushState(res);
      setOtpCode("");
    });
  }

  function handleCheck() {
    if (!pushState?.reference) return;

    startTransition(async () => {
      const check = await checkOrConfirmMomoPinAction({
        orderId,
        reference: pushState.reference!,
        chargeScope,
      });
      setStatusMessage(check.message);
      if (check.paid) {
        setConfirmedPaid(true);
        router.refresh();
      }
    });
  }

  function handleClose() {
    setIsOpen(false);
    if (confirmedPaid) {
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setPhone(defaultPhone);
          setIsOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-sm border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-900 transition-colors hover:bg-amber-500/20"
        title="Direct Mobile Money USSD / STK PIN Push"
      >
        <Smartphone className="h-3.5 w-3.5 text-amber-700" />
        <span>Push MoMo PIN</span>
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
          onClick={handleClose}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] shadow-2xl animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border-subtle)] bg-[#FAF6EF] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-amber-500/20 text-amber-800">
                  <Smartphone className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">
                    Direct MoMo PIN Push · {orderNumber}
                  </h3>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {customerName ? `${customerName} · ` : ""}
                    {formatMoney(selectedAmountMinor)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="grid h-7 w-7 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Sends a live USSD / STK pop-up directly to the customer’s phone asking them to enter
                their <strong>4-digit Mobile Money PIN</strong>. As soon as they authorize it, this
                order automatically marks as <strong>PAID</strong>.
              </p>

              {confirmedPaid ? (
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-emerald-900">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                    <div>
                      <p className="text-sm font-semibold">
                        Client MoMo PIN Confirmed — Order is PAID!
                      </p>
                      <p className="mt-1 text-xs leading-relaxed">
                        {statusMessage ??
                          `Payment of ${formatMoney(selectedAmountMinor)} was confirmed on ${phone}.`}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleSendPush} className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Customer MoMo Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 0244123456"
                      className="lx-field mt-1 w-full bg-white py-2 text-sm font-mono"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Telco Network
                      </label>
                      <select
                        value={provider}
                        onChange={(e) => setProvider(e.target.value as "auto" | MomoProvider)}
                        className="lx-field mt-1 w-full bg-white py-2 text-xs"
                      >
                        <option value="auto">Auto-Detect from Number</option>
                        <option value="mtn">MTN MoMo (024/054/055/059)</option>
                        <option value="vod">Telecel Cash (020/050)</option>
                        <option value="atl">AT Money (027/057/026)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                        Amount to Prompt
                      </label>
                      <select
                        value={chargeScope}
                        onChange={(e) => setChargeScope(e.target.value as "FULL" | "DEPOSIT_50")}
                        className="lx-field mt-1 w-full bg-white py-2 text-xs"
                      >
                        <option value="FULL">100% Full Order ({formatMoney(totalMinor)})</option>
                        {depositMinor ? (
                          <option value="DEPOSIT_50">
                            50% Deposit ({formatMoney(depositVal)})
                          </option>
                        ) : null}
                      </select>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-contrast)] transition hover:opacity-95 disabled:opacity-50"
                  >
                    {isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Dispatching USSD Prompt to {phone}...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send MoMo PIN Prompt ({formatMoney(selectedAmountMinor)}) Now
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* Active Prompt Status & Waiting Box */}
              {pushState && !confirmedPaid ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5 space-y-3">
                  {!pushState.ok ? (
                    <p className="text-xs font-medium text-red-600">{pushState.error}</p>
                  ) : (
                    <>
                      <div className="flex items-start gap-2.5">
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
                        <div className="flex-1">
                          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                            Prompt Active on {pushState.phone} ({pushState.providerLabel})
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                            {pushState.displayText}
                          </p>
                          <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                            Tip: If pop-up didn&apos;t appear automatically, client can dial{" "}
                            <strong>*170# → 6 (My Wallet) → 3 (My Approvals)</strong> to enter PIN.
                          </p>
                        </div>
                      </div>

                      {pushState.status === "send_otp" ? (
                        <form onSubmit={handleOtpSubmit} className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            placeholder="Enter SMS OTP sent to client..."
                            className="lx-field flex-1 py-1.5 text-xs"
                          />
                          <button
                            type="submit"
                            disabled={isPending}
                            className="rounded bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white"
                          >
                            Submit OTP
                          </button>
                        </form>
                      ) : null}

                      {statusMessage ? (
                        <p className="rounded bg-white px-3 py-2 text-xs text-[var(--text-secondary)]">
                          {statusMessage}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-2.5">
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleCheck()}
                          className="inline-flex items-center gap-1.5 rounded border border-[var(--border-subtle)] bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Check Status
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end border-t border-[var(--border-subtle)] bg-[var(--surface)] px-5 py-3">
              <button
                type="button"
                onClick={handleClose}
                className="rounded border border-[var(--border-subtle)] bg-white px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {confirmedPaid ? "Done" : "Cancel"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
