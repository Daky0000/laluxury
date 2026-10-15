"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CreditCard,
  CheckCircle2,
  ExternalLink,
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
import { MOMO_NETWORK_OPTIONS, type MomoNetworkId } from "@/lib/momo-networks";
import { cn } from "@/lib/utils";

/**
 * Pays an unpaid order (or its remaining balance) from the tracking page.
 * The shopper names their network first: networks on the store's direct list
 * get a PIN prompt on the phone, the rest and cards use the hosted page.
 */
export function OrderPaymentCard({
  orderId,
  orderNumber,
  accessToken,
  defaultPhone,
  amountDueMinor,
  directNetworks,
  isPreorderDeposit = false,
  isRemainingBalance = false,
}: {
  orderId: string;
  orderNumber: string;
  /** The signed order token the tracking page was opened with. */
  accessToken: string;
  defaultPhone: string;
  amountDueMinor: number;
  directNetworks: MomoNetworkId[];
  isPreorderDeposit?: boolean;
  isRemainingBalance?: boolean;
}) {
  const router = useRouter();
  const [payWith, setPayWith] = useState<MomoNetworkId | "card" | null>(null);
  const [phone, setPhone] = useState(defaultPhone);

  const [pushState, setPushState] = useState<CustomerMomoPushResult | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedPaid, setConfirmedPaid] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [now, setNow] = useState(0);

  const [momoRoute, setMomoRoute] = useState<"direct" | "hosted" | null>(null);
  // A network on the direct list offers the phone prompt or the hosted page.
  const directAllowed = payWith !== null && payWith !== "card" && directNetworks.includes(payWith);
  const route =
    payWith === null
      ? null
      : payWith === "card"
        ? "card"
        : !directAllowed || momoRoute === "hosted"
          ? "mobile_money"
          : momoRoute === "direct"
            ? "direct_debit"
            : null;
  const network = MOMO_NETWORK_OPTIONS.find((n) => n.id === payWith);

  useEffect(() => {
    if (!resendAvailableAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);
  const resendSeconds = Math.max(0, Math.ceil((resendAvailableAt - now) / 1000));

  // Poll while waiting for the customer to approve on their phone.
  useEffect(() => {
    if (!pushState?.ok || !pushState.reference || confirmedPaid) return;

    let attempts = 0;
    const MAX_ATTEMPTS = 40;

    const timer = setInterval(async () => {
      attempts += 1;
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(timer);
        setStatusMessage(
          "Still waiting for approval. Check your approvals, then select Check status. If nothing arrived, you can resend the prompt.",
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

  function choose(next: MomoNetworkId | "card") {
    if (pushState?.ok) return; // a prompt is out; resend or check it instead
    setPayWith(next);
    setMomoRoute(null);
    setError(null);
  }

  function handleSendPush(e?: React.FormEvent) {
    e?.preventDefault();
    if (isPending || resendSeconds > 0 || !network) return;
    setStatusMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        // Already approved? Then never send a second request.
        if (pushState?.reference) {
          const check = await customerCheckMomoPinAction({ orderId, reference: pushState.reference });
          if (check.paid) {
            setConfirmedPaid(true);
            setStatusMessage(check.message);
            router.refresh();
            return;
          }
          if (!check.ok) {
            setStatusMessage("Could not confirm payment status. Select Check status before resending.");
            return;
          }
        }
        const sentAt = Date.now();
        setNow(sentAt);
        setResendAvailableAt(sentAt + 30000);
        const res = await customerInitiateMomoPushAction({
          orderId,
          token: accessToken,
          phone,
          provider: network.id,
        });
        if (res.ok) setPushState(res);
        else if (pushState?.reference) setStatusMessage(res.error ?? "Could not resend. Please try again.");
        else setError(res.error ?? "Could not send the prompt. Please try again.");
      } catch {
        setError("Could not reach the payment service. Check your approvals before trying again.");
      }
    });
  }

  function handlePayOnline() {
    if (isPending || !route || route === "direct_debit") return;
    setError(null);
    startTransition(async () => {
      const res = await customerPayOnlineAction({
        orderId,
        token: accessToken,
        paymentMethod: route === "card" ? "bank_card" : "mobile_money",
      });
      if (res.ok) window.location.assign(res.url);
      else setError(res.error);
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
      if (res.ok) {
        setPushState((previous) => ({ ...previous, ...res }));
        setOtpCode("");
      } else {
        setStatusMessage(res.error ?? "That code was not accepted.");
      }
    });
  }

  function handleCheck() {
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
    ? "Remaining balance"
    : isPreorderDeposit
      ? "50% pre-order deposit"
      : "Payment due";

  return (
    <div className="mt-8 border border-[var(--accent)]/40 bg-[var(--surface-raised)] p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-4">
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
            {label}
          </span>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">
            Pay {formatMoney(amountDueMinor)}
          </h2>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
          <Lock className="h-3.5 w-3.5" aria-hidden />
          Secure payment
        </span>
      </div>

      {confirmedPaid ? (
        <div className="mt-5 border border-sage-600/30 bg-sage-600/10 p-5">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-sage-600" aria-hidden />
            <div>
              <h3 className="text-base font-semibold">Payment confirmed. Thank you!</h3>
              <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                {statusMessage ??
                  `We have received ${formatMoney(amountDueMinor)} for order ${orderNumber}.`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Choose your Mobile Money network, or pay by card.
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {MOMO_NETWORK_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => choose(option.id)}
                aria-pressed={payWith === option.id}
                className={cn(
                  "flex items-start gap-2.5 border px-3.5 py-3 text-left transition-colors",
                  payWith === option.id
                    ? "border-[var(--accent)]"
                    : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
                )}
              >
                <span
                  aria-hidden
                  className="mt-1 h-3 w-3 shrink-0 rounded-full"
                  style={{ backgroundColor: option.color }}
                />
                <span>
                  <span className="block text-sm font-medium">{option.label}</span>
                  <span className="block text-xs text-[var(--text-muted)]">
                    {directNetworks.includes(option.id) ? "Direct Debit or Paystack" : "Paystack secure page"}
                  </span>
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => choose("card")}
              aria-pressed={payWith === "card"}
              className={cn(
                "flex items-start gap-2.5 border px-3.5 py-3 text-left transition-colors",
                payWith === "card"
                  ? "border-[var(--accent)]"
                  : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
              )}
            >
              <CreditCard className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
              <span>
                <span className="block text-sm font-medium">Bank card</span>
                <span className="block text-xs text-[var(--text-muted)]">Visa · Mastercard</span>
              </span>
            </button>
          </div>

          {directAllowed && network && !pushState?.ok ? (
            <div>
              <p className="mb-2 text-sm text-[var(--text-secondary)]">
                How would you like to pay with {network.label}?
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(
                  [
                    { id: "direct", title: "Direct Debit", note: "A prompt on your phone; approve with your PIN." },
                    { id: "hosted", title: "Paystack", note: "Enter your number on Paystack's secure page." },
                  ] as const
                ).map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => setMomoRoute(choice.id)}
                    aria-pressed={momoRoute === choice.id}
                    className={cn(
                      "border px-3.5 py-3 text-left text-sm transition-colors",
                      momoRoute === choice.id
                        ? "border-[var(--accent)]"
                        : "border-[var(--border-subtle)] hover:border-[var(--border-strong)]",
                    )}
                  >
                    <span className="block font-medium">{choice.title}</span>
                    <span className="block text-xs text-[var(--text-muted)]">{choice.note}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {route === "direct_debit" && network && !pushState?.ok ? (
            <form onSubmit={handleSendPush} className="space-y-3">
              <label htmlFor="pay-momo-phone" className="block text-sm font-medium">
                {network.label} number
              </label>
              <input
                id="pay-momo-phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="e.g. 024 412 3456"
                className="lx-field w-full py-2.5 text-sm"
              />
              <button
                type="submit"
                disabled={isPending || resendSeconds > 0}
                className="inline-flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-contrast)] disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                Send prompt to my phone · {formatMoney(amountDueMinor)}
              </button>
            </form>
          ) : null}

          {route === "mobile_money" || route === "card" ? (
            <div className="space-y-3">
              <p className="text-sm text-[var(--text-secondary)]">
                {route === "card"
                  ? "You will enter your card details on our payment partner's secure page."
                  : `You will finish on our payment partner's secure page. Enter your ${network?.label} number there and follow its steps.`}
              </p>
              <button
                type="button"
                onClick={handlePayOnline}
                disabled={isPending}
                className="inline-flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-contrast)] disabled:opacity-50"
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ExternalLink className="h-4 w-4" aria-hidden />}
                Continue to secure payment · {formatMoney(amountDueMinor)}
              </button>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          ) : null}

          {pushState?.ok ? (
            <div className="space-y-3 border border-[var(--border-subtle)] p-4">
              <div className="flex items-start gap-2.5">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" aria-hidden />
                <div className="flex-1 text-sm">
                  <p className="font-medium">
                    Approve the request on {pushState.phone} ({pushState.providerLabel})
                  </p>
                  <p className="mt-1 text-[var(--text-secondary)]">{pushState.displayText}</p>
                  <p role="status" className="mt-1.5 text-[var(--text-secondary)]">
                    No pop-up? On MTN dial *170#, choose My Wallet, then My Approvals. Approve only
                    one request.
                  </p>
                </div>
              </div>

              {pushState.status === "send_otp" ? (
                <form onSubmit={handleOtpSubmit} className="flex items-center gap-2 pt-1">
                  <label htmlFor="pay-otp" className="sr-only">
                    Code sent to your phone
                  </label>
                  <input
                    id="pay-otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="Enter the code sent to your phone"
                    className="lx-field flex-1 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isPending || !otpCode.trim()}
                    className="bg-[var(--accent)] px-4 py-2 text-xs font-medium uppercase tracking-[0.12em] text-[var(--accent-contrast)] disabled:opacity-50"
                  >
                    Submit
                  </button>
                </form>
              ) : null}

              {statusMessage ? (
                <p className="bg-[var(--surface-sunken)] px-3 py-2 text-sm text-[var(--text-secondary)]">
                  {statusMessage}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                <button
                  type="button"
                  disabled={isPending || resendSeconds > 0}
                  onClick={() => handleSendPush()}
                  className="inline-flex items-center gap-1.5 border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-50"
                >
                  <Send className="h-3 w-3" aria-hidden />
                  {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : "Resend prompt"}
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={handleCheck}
                  className="inline-flex items-center gap-1.5 border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)]"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden />
                  Check status
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
