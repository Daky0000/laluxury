"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Smartphone, CheckCircle2, Loader2, ShieldCheck, RefreshCw, Send } from "lucide-react";
import {
  initiateMomoPinPushAction,
  submitMomoPushOtpAction,
  checkOrConfirmMomoPinAction,
  type MomoPushResult,
} from "@/app/actions/admin/momo-push";
import { formatMoney } from "@/lib/money";
import type { MomoProvider } from "@/lib/paystack";

export function MomoPinPushCard({
  orderId,
  orderNumber,
  defaultPhone,
  totalMinor,
  depositMinor,
  isPaid,
  balancePaid,
}: {
  orderId: string;
  orderNumber: string;
  defaultPhone: string;
  totalMinor: number;
  depositMinor: number | null;
  isPaid: boolean;
  balancePaid: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoTriggered = searchParams.get("momoPush") === "1";

  const hasRemainingBalance = Boolean(depositMinor && depositMinor < totalMinor && !balancePaid && isPaid);

  const [phone, setPhone] = useState(defaultPhone);
  const [provider, setProvider] = useState<"auto" | MomoProvider>("auto");
  const [chargeScope, setChargeScope] = useState<"FULL" | "DEPOSIT_50" | "REMAINING_BALANCE">(
    hasRemainingBalance ? "REMAINING_BALANCE" : depositMinor ? "DEPOSIT_50" : "FULL",
  );

  const [pushState, setPushState] = useState<MomoPushResult | null>(null);
  const [otpCode, setOtpCode] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [confirmedPaid, setConfirmedPaid] = useState(false);
  const [isPending, startTransition] = useTransition();

  const depositVal = depositMinor ?? Math.round(totalMinor * 0.5);
  const remainingVal = Math.max(0, totalMinor - depositVal);

  const selectedAmountMinor =
    chargeScope === "DEPOSIT_50"
      ? depositVal
      : chargeScope === "REMAINING_BALANCE"
        ? remainingVal
        : totalMinor;

  // Auto-trigger if redirected from Showroom POS with ?momoPush=1
  useEffect(() => {
    if (autoTriggered && !pushState && defaultPhone && (!isPaid || hasRemainingBalance)) {
      startTransition(async () => {
        const res = await initiateMomoPinPushAction({
          orderId,
          phone: defaultPhone,
          provider: "auto",
          chargeScope: hasRemainingBalance ? "REMAINING_BALANCE" : depositMinor ? "DEPOSIT_50" : "FULL",
        });
        setPushState(res);
      });
    }
  }, [autoTriggered, defaultPhone, depositMinor, hasRemainingBalance, isPaid, orderId, pushState]);

  // Poll every 4.5s while waiting for customer PIN entry, capped at 25 attempts (~110s)
  useEffect(() => {
    if (!pushState?.ok || !pushState.reference || confirmedPaid) return;

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
        simulateClientPinEntered: false,
      });
      if (check.paid) {
        setConfirmedPaid(true);
        setStatusMessage(check.message);
        router.refresh();
      }
    }, 4500);

    return () => clearInterval(timer);
  }, [pushState, confirmedPaid, orderId, chargeScope, router]);

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

  function handleCheckOrSimulate(simulate: boolean) {
    if (!pushState?.reference) return;
    startTransition(async () => {
      const check = await checkOrConfirmMomoPinAction({
        orderId,
        reference: pushState.reference!,
        chargeScope,
        simulateClientPinEntered: simulate,
      });
      setStatusMessage(check.message);
      if (check.paid) {
        setConfirmedPaid(true);
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-lg border-2 border-[var(--accent)]/40 bg-[#FAF6EF] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-[var(--accent)]" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]">
              Direct Mobile Money USSD / STK Push
            </p>
            <h3 className="text-base font-semibold text-[var(--text-primary)]">
              Send MoMo PIN Prompt to Client’s Phone ({orderNumber})
            </h3>
          </div>
        </div>
        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
          MTN MoMo · Telecel Cash · AT Money
        </span>
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
        Enter the client’s Ghana Mobile Money number below. Clicking{" "}
        <strong>“Send MoMo PIN Prompt Now”</strong> pushes a live payment pop-up directly to their
        handset asking them to enter their <strong>4-digit MoMo PIN</strong>. As soon as they type
        their PIN, this order automatically confirms and marks itself as <strong>PAID</strong>.
      </p>

      {confirmedPaid ? (
        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-50 p-4 text-emerald-900">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold">
                Client MoMo PIN Confirmed — Order Marked as PAID!
              </p>
              <p className="mt-1 text-xs leading-relaxed">
                {statusMessage ??
                  `Payment of ${formatMoney(selectedAmountMinor)} was authorised by the client on ${phone}.`}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSendPush} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Client MoMo Number *
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
                Telco Network
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as "auto" | MomoProvider)}
                className="lx-field mt-1 w-full bg-white py-2 text-xs"
              >
                <option value="auto">Auto-Detect from Number (024/054/020/027)</option>
                <option value="mtn">MTN Mobile Money (024 / 054 / 055 / 059)</option>
                <option value="vod">Telecel / Vodafone Cash (020 / 050)</option>
                <option value="tgo">AT / AirtelTigo Money (027 / 057 / 026)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Amount to Prompt
              </label>
              <select
                value={chargeScope}
                onChange={(e) =>
                  setChargeScope(e.target.value as "FULL" | "DEPOSIT_50" | "REMAINING_BALANCE")
                }
                className="lx-field mt-1 w-full bg-white py-2 text-xs"
              >
                <option value="FULL">100% Full Order ({formatMoney(totalMinor)})</option>
                <option value="DEPOSIT_50">
                  50% Pre-Order Deposit ({formatMoney(depositVal)})
                </option>
                {remainingVal > 0 ? (
                  <option value="REMAINING_BALANCE">
                    50% Remaining Balance ({formatMoney(remainingVal)})
                  </option>
                ) : null}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition hover:opacity-95 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Dispatching USSD Prompt to {phone}...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send MoMo PIN Prompt ({formatMoney(selectedAmountMinor)}) to {phone || "Phone"}
              </>
            )}
          </button>
        </form>
      )}

      {/* Active Waiting / PIN Prompt Status Box */}
      {pushState && !confirmedPaid ? (
        <div className="mt-4 rounded-lg border border-[var(--border-subtle)] bg-white p-4">
          {!pushState.ok ? (
            <p className="text-xs font-medium text-red-600">{pushState.error}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--accent)]" />
                <div className="flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
                    Prompt Active on {pushState.phone} ({pushState.providerLabel}) · Ref:{" "}
                    {pushState.reference}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {pushState.displayText}
                  </p>
                  <p className="mt-1.5 text-[11px] text-[var(--text-muted)]">
                    Tip: If the pop-up did not appear automatically on an MTN phone, the client can
                    also dial <strong>*170# → 6 (My Wallet) → 3 (My Approvals)</strong> to enter
                    their 4-digit MoMo PIN.
                  </p>
                </div>
              </div>

              {pushState.status === "send_otp" ? (
                <form onSubmit={handleOtpSubmit} className="flex items-center gap-2 pt-2">
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
                <p className="rounded bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
                  {statusMessage}
                </p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-subtle)] pt-3">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleCheckOrSimulate(false)}
                  className="inline-flex items-center gap-1.5 rounded border border-[var(--border-subtle)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)]"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Check PIN Status Now
                </button>

                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleCheckOrSimulate(true)}
                  className="inline-flex items-center gap-1.5 rounded bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {pushState.simulated
                    ? "Simulate Client Entering MoMo PIN on Phone ✓"
                    : "Confirm MoMo PIN Received & Mark Paid ✓"}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
