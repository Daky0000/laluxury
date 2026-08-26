"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  updateOrderStatusAction,
  addOrderNoteAction,
  refundOrderAction,
} from "@/app/actions/admin/orders";
import type { AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert } from "@/components/ui";
import { toMajorUnits, formatMoney } from "@/lib/money";
import type { OrderStatus } from "@/generated/prisma";

/** Only forward transitions are offered, so staff cannot un-ship an order. */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CANCELLED"],
  PAID: ["PROCESSING", "FULFILLED", "CANCELLED"],
  PROCESSING: ["FULFILLED", "SHIPPED", "CANCELLED"],
  FULFILLED: ["SHIPPED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
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

export function OrderControls({
  orderId,
  status,
  trackingNumber,
  trackingCompany,
  staffNote,
  outstanding,
  canRefund,
}: {
  orderId: string;
  status: OrderStatus;
  trackingNumber: string | null;
  trackingCompany: string | null;
  staffNote: string | null;
  outstanding: number;
  canRefund: boolean;
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

  const options = NEXT_STATUSES[status];
  const [chosen, setChosen] = useState<OrderStatus | "">(options[0] ?? "");
  const [showRefund, setShowRefund] = useState(false);

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
                onChange={(event) => setChosen(event.target.value as OrderStatus)}
                className="lx-field"
              >
                {options.map((option) => (
                  <option key={option} value={option}>
                    {LABELS[option]}
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

            {chosen === "CANCELLED" ? (
              <Field label="Reason" htmlFor="reason" hint="Stock is returned automatically.">
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

      {/* Refund */}
      {canRefund ? (
        <Card className="border-danger/30 p-5">
          <h2 className="lx-eyebrow mb-1">Refund</h2>
          <p className="mb-3 text-sm text-[var(--text-secondary)]">
            Up to {formatMoney(outstanding)} can still be refunded.
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
              <Field label="Amount (GHS)" htmlFor="amount" required>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={toMajorUnits(outstanding)}
                  defaultValue={toMajorUnits(outstanding)}
                  required
                  className="lx-field"
                />
              </Field>

              <Field label="Reason" htmlFor="refundReason" required>
                <input id="refundReason" name="reason" required className="lx-field" />
              </Field>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="restock"
                  defaultChecked
                  className="accent-[var(--accent)]"
                />
                Put the items back into stock
              </label>

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
