"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, MapPin, Printer, Send } from "lucide-react";
import { resendOrderNoticeAction, updateOrderAddressAction } from "@/app/actions/admin/orders";
import type { AdminState } from "@/app/actions/admin/products";
import { GHANA_REGIONS } from "@/lib/constants";
import { formatPhone } from "@/lib/phone";
import { Alert, Card, Field } from "@/components/ui";

/**
 * The order-page tools that are not a status change: print it, tell the
 * customer again, and fix the address before the rider leaves.
 */

export function OrderToolbar({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [resending, startResend] = useTransition();
  const [notice, setNotice] = useState<AdminState | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/print/orders/${orderId}`}
        target="_blank"
        rel="noopener"
        className="inline-flex items-center gap-2 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)]"
      >
        <Printer className="h-4 w-4" aria-hidden />
        Print invoice
      </a>
      <button
        type="button"
        disabled={resending}
        onClick={() => {
          setNotice(null);
          startResend(async () => setNotice(await resendOrderNoticeAction(orderId)));
        }}
        className="inline-flex items-center gap-2 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        title={`Text and email the customer about ${orderNumber} again`}
      >
        {resending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
        Resend notice
      </button>
      {notice?.message ? (
        <span className={`text-xs ${notice.ok ? "text-success" : "text-danger"}`}>{notice.message}</span>
      ) : null}
    </div>
  );
}

export type EditableAddress = {
  firstName: string;
  lastName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postalCode: string | null;
};

export function EditOrderAddress({
  orderId,
  address,
  locked,
}: {
  orderId: string;
  address: EditableAddress | null;
  /** True once the order has shipped: the address is history then. */
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await updateOrderAddressAction(orderId, prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    null,
  );

  if (locked) return null;

  if (!open) {
    return (
      <div className="mt-3 border-t border-[var(--border-subtle)] pt-3">
        {state?.message ? (
          <p className={`mb-2 text-xs ${state.ok ? "text-success" : "text-danger"}`}>{state.message}</p>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)]"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {address ? "Change the address" : "Add a delivery address"}
        </button>
      </div>
    );
  }

  const field = "lx-field rounded-lg py-1.5 text-sm";

  return (
    <Card className="mt-3 p-4">
      <form action={action} className="flex flex-col gap-3">
        {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="First name" htmlFor="addr-first" required>
            <input id="addr-first" name="firstName" required defaultValue={address?.firstName ?? ""} className={field} />
          </Field>
          <Field label="Last name" htmlFor="addr-last">
            <input id="addr-last" name="lastName" defaultValue={address?.lastName ?? ""} className={field} />
          </Field>
        </div>

        <Field label="Phone" htmlFor="addr-phone" required>
          <input
            id="addr-phone"
            name="phone"
            type="tel"
            required
            defaultValue={address ? formatPhone(address.phone) : ""}
            className={field}
          />
        </Field>

        <Field label="Address" htmlFor="addr-line1" required>
          <input id="addr-line1" name="line1" required defaultValue={address?.line1 ?? ""} className={field} />
        </Field>
        <Field label="Landmark or apartment" htmlFor="addr-line2">
          <input id="addr-line2" name="line2" defaultValue={address?.line2 ?? ""} className={field} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="City" htmlFor="addr-city" required>
            <input id="addr-city" name="city" required defaultValue={address?.city ?? ""} className={field} />
          </Field>
          <Field label="Region" htmlFor="addr-region" required>
            <select id="addr-region" name="region" required defaultValue={address?.region ?? ""} className={field}>
              <option value="">Choose</option>
              {GHANA_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Digital address" htmlFor="addr-postal">
          <input id="addr-postal" name="postalCode" defaultValue={address?.postalCode ?? ""} placeholder="GA-123-4567" className={field} />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs text-white disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            Save address
          </button>
          <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--text-secondary)]">
            Cancel
          </button>
        </div>
      </form>
    </Card>
  );
}
