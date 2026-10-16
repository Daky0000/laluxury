"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { resolveHeldPaymentAction } from "@/app/actions/admin/orders";
import { Card, Badge, Alert } from "@/components/ui";
import { formatMoney } from "@/lib/money";

export type LedgerPayment = {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  provider: string;
  channel: string;
  purpose: string | null;
  refundedAmount: number;
  heldReason: string | null;
  held: boolean;
  paidAt: string | null;
  createdAt: string;
};

export type LedgerRefund = {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  reason: string;
  failureReason: string | null;
  createdAt: string;
};

const PURPOSE: Record<string, string> = { FULL: "Full", DEPOSIT: "Deposit", BALANCE: "Balance" };

/**
 * Every payment attempt and refund on the order, newest first. Payments held
 * for review (an amount that did not match, a test-mode payment, a second
 * payment) are flagged with what to do about them.
 */
export function PaymentLedger({
  orderId,
  payments,
  refunds,
  canResolve,
}: {
  orderId: string;
  payments: LedgerPayment[];
  refunds: LedgerRefund[];
  canResolve: boolean;
}) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function resolve(paymentId: string) {
    setBusy(paymentId);
    startTransition(async () => {
      const res = await resolveHeldPaymentAction(orderId, paymentId);
      setMessage({ ok: res.ok, text: res.message ?? "" });
      setBusy(null);
    });
  }

  if (payments.length === 0 && refunds.length === 0) return null;

  return (
    <Card className="p-5">
      <h2 className="lx-eyebrow mb-3">Payments &amp; refunds</h2>
      <ul className="flex flex-col divide-y divide-[var(--border-subtle)] text-sm">
        {payments.map((p) => (
          <li key={p.id} className="flex flex-col gap-1 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium tabular-nums">{formatMoney(p.amount, p.currency)}</span>
              <span className="flex flex-wrap gap-1.5">
                {p.purpose ? <Badge tone="neutral">{PURPOSE[p.purpose] ?? p.purpose}</Badge> : null}
                <Badge
                  tone={
                    p.held ? "warning" : p.status === "SUCCESS" ? "success" : p.status === "FAILED" ? "danger" : "neutral"
                  }
                >
                  {p.held ? "Held" : p.status.toLowerCase()}
                </Badge>
              </span>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              {p.provider === "paystack" ? "Paystack" : p.provider} · {p.channel} ·{" "}
              <span className="font-mono">{p.reference}</span>
            </span>
            {p.refundedAmount > 0 ? (
              <span className="text-xs text-danger">Refunded {formatMoney(p.refundedAmount, p.currency)}</span>
            ) : null}
            {p.held ? (
              <div className="mt-1 rounded-sm border border-warning/40 bg-warning/10 p-2.5 text-xs">
                <p>{p.heldReason ?? "Held for review."}</p>
                {canResolve ? (
                  <button
                    type="button"
                    onClick={() => resolve(p.id)}
                    disabled={busy !== null}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-[var(--border-strong)] px-2.5 py-1 font-medium disabled:opacity-50"
                  >
                    {busy === p.id ? <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> : null}
                    {p.status === "SUCCESS" ? "Mark reviewed (keep on order)" : "Accept what Paystack took"}
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
        {refunds.map((r) => (
          <li key={r.id} className="flex flex-col gap-1 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium tabular-nums text-danger">−{formatMoney(r.amount, r.currency)}</span>
              <Badge tone={r.status === "PROCESSED" ? "success" : r.status === "FAILED" ? "danger" : "warning"}>
                Refund {r.status.toLowerCase()}
              </Badge>
            </div>
            <span className="text-xs text-[var(--text-muted)]">
              {r.method === "manual" ? "Returned by hand" : "Through Paystack"} · {r.reason}
            </span>
            {r.failureReason ? <span className="text-xs text-danger">{r.failureReason}</span> : null}
          </li>
        ))}
      </ul>
      {message?.text ? (
        <div className="mt-3">
          <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert>
        </div>
      ) : null}
    </Card>
  );
}
