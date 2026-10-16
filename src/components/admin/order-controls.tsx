"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  updateOrderStatusAction,
  addOrderNoteAction,
  refundOrderAction,
  recordBalanceAction,
} from "@/app/actions/admin/orders";
import type { AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert } from "@/components/ui";
import { toMajorUnits, formatMoney } from "@/lib/money";
import { MANUAL_PAYMENT_METHODS } from "@/lib/constants";
import type { OrderStatus } from "@/generated/prisma";

/**
 * Forward steps only, so staff cannot un-ship an order. The exceptions are
 * payment: an unpaid order can be marked paid, and a cancelled one reopened.
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "FULFILLED", "CANCELLED"],
  PROCESSING: ["FULFILLED", "SHIPPED", "CANCELLED"],
  FULFILLED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: ["PENDING", "PAID"],
  REFUNDED: [],
};

const LABELS: Record<OrderStatus, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  PROCESSING: "Processing",
  FULFILLED: "Fulfilled",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  REFUNDED: "Refunded",
};

export type RefundLine = {
  id: string;
  title: string;
  /** Units that left the shelf and can still go back on it. */
  restockable: number;
};

export function OrderControls({
  orderId,
  status,
  isPaid,
  trackingNumber,
  trackingCompany,
  staffNote,
  outstanding,
  canRefund,
  canRecordPayment,
  paystackRefundable,
  refundLines,
  balanceDue,
}: {
  orderId: string;
  status: OrderStatus;
  /** Money has been received on this order. */
  isPaid: boolean;
  trackingNumber: string | null;
  trackingCompany: string | null;
  staffNote: string | null;
  /** Money received and not yet refunded. */
  outstanding: number;
  canRefund: boolean;
  canRecordPayment: boolean;
  /** Of `outstanding`, how much Paystack can send back (card/MoMo payments). */
  paystackRefundable: number;
  refundLines: RefundLine[];
  /** Balance still owed on a deposit order. */
  balanceDue: number;
}) {
  const [statusState, statusAction, statusPending] = useActionState<AdminState | null, FormData>(
    updateOrderStatusAction.bind(null, orderId),
    null,
  );
  const [noteState, noteAction, notePending] = useActionState<AdminState | null, FormData>(
    addOrderNoteAction.bind(null, orderId),
    null,
  );
  const [refundState, refundAction, refundPending] = useActionState<AdminState | null, FormData>(
    refundOrderAction.bind(null, orderId),
    null,
  );

  const [balanceState, balanceAction, balancePending] = useActionState<AdminState | null, FormData>(
    recordBalanceAction.bind(null, orderId),
    null,
  );

  // Recording money taken outside Paystack is a manager's call.
  const options = NEXT_STATUSES[status].filter((option) => canRecordPayment || option !== "PAID");
  const [picked, setPicked] = useState<OrderStatus | "">(options[0] ?? "");
  // After a change the order has new options; a stale pick falls back to the first.
  const chosen = picked && options.includes(picked) ? picked : (options[0] ?? "");
  const [showRefund, setShowRefund] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"provider" | "manual">(
    paystackRefundable > 0 ? "provider" : "manual",
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Fulfilment */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-3">Update status</h2>

        {options.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            This order is {LABELS[status].toLowerCase()}; there is nothing further to set.
          </p>
        ) : (
          <form action={statusAction} className="flex flex-col gap-3">
            <Field label="Move to" htmlFor="status">
              <select
                id="status"
                name="status"
                value={chosen}
                onChange={(event) => setPicked(event.target.value as OrderStatus)}
                className="lx-field"
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {status === "CANCELLED"
                      ? option === "PAID"
                        ? "Reopen as paid"
                        : "Reopen, awaiting payment"
                      : LABELS[option]}
                  </option>
                ))}
              </select>
            </Field>

            {chosen === "SHIPPED" ? (
              <>
                <Field label="Tracking number" htmlFor="trackingNumber">
                  <input
                    id="trackingNumber"
                    name="trackingNumber"
                    defaultValue={trackingNumber ?? ""}
                    className="lx-field"
                  />
                </Field>
                <Field label="Carrier" htmlFor="trackingCompany">
                  <input
                    id="trackingCompany"
                    name="trackingCompany"
                    defaultValue={trackingCompany ?? ""}
                    placeholder="Speedaf, DHL, in-house"
                    className="lx-field"
                  />
                </Field>
              </>
            ) : null}

            {chosen === "PAID" ? (
              <Field
                label="Payment received by"
                htmlFor="paymentMethod"
                hint="Paystack is checked first. The customer gets their receipt text and you get the new order alert."
              >
                <select id="paymentMethod" name="paymentMethod" defaultValue="mobile_money" className="lx-field">
                  {Object.entries(MANUAL_PAYMENT_METHODS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            {chosen === "PAID" ? (
              <Field
                label="Proof"
                htmlFor="paymentNote"
                hint="Receipt number, MoMo transaction ID or who took the cash. Kept on the order."
                required
              >
                <input id="paymentNote" name="paymentNote" required className="lx-field" />
              </Field>
            ) : null}

            {status === "CANCELLED" ? (
              <p className="text-sm text-[var(--text-secondary)]">
                Reopening reserves the stock again. If a piece has since sold out, it will say so.
              </p>
            ) : null}

            {chosen === "CANCELLED" ? (
              <Field
                label="Reason"
                htmlFor="reason"
                hint={
                  isPaid
                    ? "Stock is returned automatically. This order is paid: the money stays on file as owed back until you refund it below."
                    : "Stock is returned automatically."
                }
              >
                <input id="reason" name="reason" required className="lx-field" />
              </Field>
            ) : null}

            <button
              type="submit"
              disabled={statusPending}
              className="flex items-center justify-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
            >
              {statusPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Update
            </button>
          </form>
        )}

        {statusState?.message ? (
          <div className="mt-3">
            <Alert tone={statusState.ok ? "success" : "danger"}>{statusState.message}</Alert>
          </div>
        ) : null}
      </Card>

      {/* Staff note */}
      <Card className="p-5">
        <h2 className="lx-eyebrow mb-3">Internal note</h2>
        <form action={noteAction} className="flex flex-col gap-3">
          <label htmlFor="note" className="sr-only">
            Note
          </label>
          <textarea
            id="note"
            name="note"
            rows={3}
            defaultValue={staffNote ?? ""}
            placeholder="Only staff see this."
            className="lx-field resize-y"
          />
          <button
            type="submit"
            disabled={notePending}
            className="rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-2 text-sm disabled:opacity-50"
          >
            {notePending ? "Saving…" : "Save note"}
          </button>
        </form>
        {noteState?.message ? (
          <p className="mt-2 text-sm text-success">{noteState.message}</p>
        ) : null}
      </Card>

      {/* Balance collected by hand */}
      {balanceDue > 0 && canRecordPayment && status !== "CANCELLED" && status !== "REFUNDED" ? (
        <Card className="p-5">
          <h2 className="lx-eyebrow mb-1">Balance due</h2>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            {formatMoney(balanceDue)} is still owed. Record it here when it is paid in cash or by transfer; a MoMo prompt
            from the card above records itself.
          </p>
          <form action={balanceAction} className="flex flex-col gap-3">
            <Field label="Paid by" htmlFor="balanceMethod">
              <select id="balanceMethod" name="paymentMethod" defaultValue="cash" className="lx-field">
                {Object.entries(MANUAL_PAYMENT_METHODS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Proof" htmlFor="balanceNote" hint="Receipt number, transaction ID or who collected it." required>
              <input id="balanceNote" name="paymentNote" required className="lx-field" />
            </Field>
            <button
              type="submit"
              disabled={balancePending}
              className="flex items-center justify-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-4 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
            >
              {balancePending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Record balance received
            </button>
          </form>
          {balanceState?.message ? (
            <div className="mt-3">
              <Alert tone={balanceState.ok ? "success" : "danger"}>{balanceState.message}</Alert>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Refund */}
      {canRefund && outstanding > 0 ? (
        <Card className="border-danger/30 p-5">
          <h2 className="lx-eyebrow mb-1">Refund</h2>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Up to {formatMoney(outstanding)} can still be refunded
            {paystackRefundable < outstanding
              ? `; ${formatMoney(paystackRefundable)} of it through Paystack, the rest by hand`
              : ""}
            .
          </p>

          {!showRefund ? (
            <button
              type="button"
              onClick={() => setShowRefund(true)}
              className="rounded-(--radius-card) border border-danger px-4 py-2 text-sm text-danger"
            >
              Refund this order
            </button>
          ) : (
            <form action={refundAction} className="flex flex-col gap-3">
              <fieldset className="flex flex-col gap-1.5 text-sm">
                <legend className="mb-1 text-sm font-medium">How the money goes back</legend>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="method"
                    value="provider"
                    checked={refundMethod === "provider"}
                    disabled={paystackRefundable <= 0}
                    onChange={() => setRefundMethod("provider")}
                    className="accent-[var(--accent)]"
                  />
                  Through Paystack, to the card or MoMo wallet that paid
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="method"
                    value="manual"
                    checked={refundMethod === "manual"}
                    onChange={() => setRefundMethod("manual")}
                    className="accent-[var(--accent)]"
                  />
                  Already returned by hand (cash, MoMo or transfer)
                </label>
              </fieldset>

              <Field label="Amount (GHS)" htmlFor="amount" required>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={toMajorUnits(refundMethod === "provider" ? paystackRefundable : outstanding)}
                  defaultValue={toMajorUnits(refundMethod === "provider" ? paystackRefundable : outstanding)}
                  key={refundMethod}
                  required
                  className="lx-field"
                />
              </Field>

              <Field label="Reason" htmlFor="refundReason" required>
                <input id="refundReason" name="reason" required className="lx-field" />
              </Field>

              {refundLines.some((line) => line.restockable > 0) ? (
                <fieldset className="flex flex-col gap-2 text-sm">
                  <legend className="mb-1 text-sm font-medium">Put back into stock</legend>
                  {refundLines
                    .filter((line) => line.restockable > 0)
                    .map((line) => (
                      <label key={line.id} className="flex items-center justify-between gap-3">
                        <span className="min-w-0 truncate">{line.title}</span>
                        <input
                          type="number"
                          name={`restock:${line.id}`}
                          min={0}
                          max={line.restockable}
                          defaultValue={0}
                          aria-label={`Units of ${line.title} to restock`}
                          className="lx-field w-20"
                        />
                      </label>
                    ))}
                  <span className="text-xs text-[var(--text-muted)]">Only the units that actually came back.</span>
                </fieldset>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={refundPending}
                  className="flex flex-1 items-center justify-center gap-2 rounded-(--radius-card) bg-danger px-4 py-2.5 text-sm text-white disabled:opacity-50"
                >
                  {refundPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                  Confirm refund
                </button>
                <button
                  type="button"
                  onClick={() => setShowRefund(false)}
                  className="rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-2.5 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {refundState?.message ? (
            <div className="mt-3">
              <Alert tone={refundState.ok ? "success" : "danger"}>{refundState.message}</Alert>
            </div>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
