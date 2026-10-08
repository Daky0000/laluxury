"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Smartphone,
  CreditCard,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  Lock,
} from "lucide-react";
import {
  customerPayOnlineAction,
  customerInitiateMomoPushAction,
  customerSubmitMomoOtpAction,
  customerCheckMomoPinAction,
  type CustomerMomoPushResult,
} from "@/app/actions/order-pay";
import { formatMoney } from "@/lib/money";
import type { MomoProvider } from "@/lib/paystack";

export function OrderPaymentCard({
  orderId,
  orderNumber,
  defaultPhone,
  amountDueMinor,
  isPreorderDeposit = false,
  isRemainingBalance = false,
}: {
  orderId: string;
  orderNumber: string;
  defaultPhone: string;
  amountDueMinor: number;
  isPreorderDeposit?: boolean;
  isRemainingBalance?: boolean;
}) {
  const router = useRouter();
  const [method, setMethod] = useState<"direct_debit" | "mobile_money" | "bank_card">("direct_debit");
  const [phone, setPhone] = useState(defaultPhone);
  const [provider, setProvider] = useState<"auto" | MomoProvider>("auto");

  const [pushState, setPushState] = useState<CustomerMomoPushResult | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmedPaid, setConfirmedPaid] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(0);

  useEffect(() => {
    if (!resendAvailableAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);
  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  // Poll every 4.5s while waiting for customer PIN entry
  useEffect(() => {
    if (!pushState?.ok || !pushState.reference || confirmedPaid) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 25;

    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        setStatusMessage(
          "Still waiting for approval. Check your Mobile Money approvals, then select Check PIN Status. If you have not approved or been debited, you can resend the prompt.",
        );
        return;
      }

      const check = await customerCheckMomoPinAction({
        orderId,
        reference: pushState.reference!,
      });

      if (check.paid) {
        setConfirmedPaid(true);
        setStatusMessage(check.message);
        router.refresh();
      }
    }, 4500);

    return () => clearInterval(timer);
  }, [pushState, confirmedPaid, orderId, router]);

  function handleSendPush(e?: React.FormEvent) {
    e?.preventDefault();
    if (isPending || resendSeconds > 0) return;
    setStatusMessage(null);
    setConfirmedPaid(false);

    startTransition(async () => {
      try {
      if (pushState?.reference) {
        const check = await customerCheckMomoPinAction({ orderId, reference: pushState.reference });
        if (check.paid) {
          setConfirmedPaid(true);
          setStatusMessage(check.message);
          router.refresh();
          return;
        }
        if (!check.ok) {
          setStatusMessage("Could not confirm payment status. Check PIN Status before resending.");
          return;
        }
      }
      const sentAt = Date.now();
      setNow(sentAt);
      setResendAvailableAt(sentAt + 30000);
      const res = await customerInitiateMomoPushAction({
        orderId,
        phone,
        provider,
      });
      if (res.ok) setPushState(res);
      else if (pushState?.reference) setStatusMessage(res.error ?? "Could not resend. Please try again.");
      else setPushState(res);
      } catch {
        const message = "Could not reach the payment service. Check your approvals and payment status before trying again.";
        if (pushState?.reference) setStatusMessage(message);
        else setPushState({ ok: false, error: message });
      }
    });
  }

  function handleOtpSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pushState?.reference || !otpCode.trim()) return;

    startTransition(async () => {
      const res = await customerSubmitMomoOtpAction({
        orderId,
        reference: pushState.reference!,
        otp: otpCode,
      });
      setPushState((previous) => ({ ...previous, ...res }));
      setOtpCode("");
    });
  }

  function handleCheckOrSimulate() {
    if (!pushState?.reference) return;

    startTransition(async () => {
      const check = await customerCheckMomoPinAction({
        orderId,
        reference: pushState.reference!,
      });
      setStatusMessage(check.message);
      if (check.paid) {
        setConfirmedPaid(true);
        router.refresh();
      }
    });
  }

  const label = isRemainingBalance
    ? "50% Remaining Balance"
    : isPreorderDeposit
      ? "50% Pre-Order Deposit"
      : "Order Payment Due";

  return (
    <div className="mt-8 rounded-lg border-2 border-[var(--accent)]/40 bg-[#FAF6EF] p-5 sm:p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            {label}
          </span>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Complete Payment · {formatMoney(amountDueMinor)}
          </h2>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-emerald-600/10 px-3 py-1 text-xs font-medium text-emerald-800">
          <Lock className="h-3.5 w-3.5" />
          <span>256-Bit Encrypted Secure Checkout</span>
        </div>
      </div>

      {confirmedPaid ? (
        <div className="mt-5 rounded-lg border border-emerald-500/40 bg-emerald-50 p-5 text-emerald-950">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <h3 className="text-base font-bold">Payment Confirmed · Thank You!</h3>
              <p className="mt-1 text-xs leading-relaxed text-emerald-800">
                {statusMessage ??
                  `Your payment of ${formatMoney(amountDueMinor)} has been received and confirmed. Order ${orderNumber} is now moving forward!`}
              </p>
              <button
                type="button"
                onClick={() => router.refresh()}
                className="mt-3 inline-flex items-center gap-1.5 rounded bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Order Status
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          {/* Method Selector Tabs */}
          <div className="grid grid-cols-3 gap-2 rounded-lg bg-[var(--surface-sunken)] p-1">
            <button
              type="button"
              onClick={() => setMethod("direct_debit")}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                method === "direct_debit"
                  ? "bg-white text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Smartphone className="h-4 w-4 text-[var(--accent)]" />
              <span>Direct Debit</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod("mobile_money")}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                method === "mobile_money"
                  ? "bg-white text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Smartphone className="h-4 w-4 text-[var(--accent)]" />
              <span>Mobile Money</span>
            </button>
            <button
              type="button"
              onClick={() => setMethod("bank_card")}
              className={`flex items-center justify-center gap-2 rounded-md py-2.5 text-xs font-semibold uppercase tracking-wider transition-all ${
                method === "bank_card"
                  ? "bg-white text-[var(--text-primary)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <CreditCard className="h-4 w-4 text-[var(--accent)]" />
              <span>Bank Card</span>
            </button>
          </div>

          {/* Tab 1: Instant Mobile Money Handset Prompt */}
          {method === "direct_debit" ? (
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Enter your Mobile Money number below. Clicking <strong>“Send MoMo Prompt”</strong>{" "}
                will push an instant authorization pop-up to your phone screen asking you to type
                your <strong>4-digit MoMo PIN</strong>.
              </p>

              <form onSubmit={handleSendPush} className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Your MoMo Phone Number *
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

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                      Network Provider
                    </label>
                    <select
                      value={provider}
                      onChange={(e) => setProvider(e.target.value as "auto" | MomoProvider)}
                      className="lx-field mt-1 w-full bg-white py-2 text-xs"
                    >
                      <option value="auto">Auto-Detect from Number</option>
                      <option value="mtn">MTN Mobile Money (024/054/055/059)</option>
                      <option value="vod">Telecel Cash (020/050)</option>
                      <option value="atl">AT Money (027/057/026)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isPending || resendSeconds > 0}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition hover:opacity-95 disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Dispatching Prompt to Your Phone...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      {resendSeconds > 0 ? `Wait ${resendSeconds}s before resending` : pushState?.reference ? "Resend MoMo Prompt" : `Send MoMo PIN Prompt (${formatMoney(amountDueMinor)}) to My Phone`}
                    </>
                  )}
                </button>
              </form>

              {/* Active Prompt Box */}
              {pushState && !confirmedPaid ? (
                <div className="rounded-lg border border-[var(--border-subtle)] bg-white p-4 space-y-3">
                  {!pushState.ok ? (
                    <p className="text-xs font-medium text-red-600">{pushState.error}</p>
                  ) : (
                    <>
                      <div className="flex items-start gap-2.5">
                        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
                        <div className="flex-1">
                          <p className="text-xs font-bold uppercase tracking-wider text-[var(--accent)]">
                            Awaiting payment approval on {pushState.phone} ({pushState.providerLabel})
                          </p>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                            {pushState.displayText}
                          </p>
                          <p role="status" className="mt-1.5 text-xs text-[var(--text-secondary)]">
                            No pop-up? {pushState.providerLabel?.includes("MTN") ? "Dial *170#, select My Wallet, then My Approvals." : "Check pending approvals in your network’s Mobile Money menu."} Approve only one request. If you have already approved or been debited, select Check PIN Status instead of resending.
                          </p>
                        </div>
                      </div>

                      {pushState.status === "send_otp" ? (
                        <form onSubmit={handleOtpSubmit} className="flex items-center gap-2 pt-1">
                          <input
                            type="text"
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value)}
                            placeholder="Enter SMS OTP sent to your phone..."
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
                        <p className="rounded bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                          {statusMessage}
                        </p>
                      ) : null}

                      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                        <button type="button" disabled={isPending || resendSeconds > 0} onClick={() => handleSendPush()} className="inline-flex items-center gap-1.5 rounded border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-50">
                          <Send className="h-3 w-3" />
                          {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend MoMo Prompt"}
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={handleCheckOrSimulate}
                          className="inline-flex items-center gap-1.5 rounded border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Check PIN Status
                        </button>

                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            /* Tab 2: Pay Online with Card / Mobile Money */
            <div className="space-y-4">
              <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                Pay instantly and securely using <strong>Visa, Mastercard, or Mobile Money</strong>{" "}
                through our secure payment page.
              </p>

              <form action={customerPayOnlineAction}>
                <input type="hidden" name="orderId" value={orderId} />
                <input type="hidden" name="paymentMethod" value={method} />
                <button
                  type="submit"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition hover:opacity-95"
                >
                  <CreditCard className="h-4 w-4" />
                  Proceed to Online Checkout ({formatMoney(amountDueMinor)}) →
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
