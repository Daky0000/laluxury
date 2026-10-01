"use client";

import { useActionState, useState, useTransition } from "react";
import { FileText, Loader2, MapPin, MessageSquare, Printer, Send, X } from "lucide-react";
import { resendOrderNoticeAction, updateOrderAddressAction } from "@/app/actions/admin/orders";
import { sendOrderReceiptAction, sendOrderCustomMessageAction } from "@/app/actions/admin/messages";
import type { AdminState } from "@/app/actions/admin/products";
import { GHANA_REGIONS } from "@/lib/constants";
import { formatPhone } from "@/lib/phone";
import { Alert, Card, Field } from "@/components/ui";

/**
 * The order-page tools that are not a status change: print it, tell the
 * customer again, send an official receipt, send custom messages, and fix the address.
 */

export function OrderToolbar({ orderId, orderNumber }: { orderId: string; orderNumber: string }) {
  const [resending, startResend] = useTransition();
  const [sendingReceipt, startReceipt] = useTransition();
  const [sendingCustom, startCustom] = useTransition();

  const [notice, setNotice] = useState<AdminState | null>(null);
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customText, setCustomText] = useState("");

  const handleCustomSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customText.trim()) return;
    setNotice(null);
    startCustom(async () => {
      const res = await sendOrderCustomMessageAction(orderId, customText);
      setNotice(res);
      if (res.ok) {
        setCustomText("");
        setShowCustomModal(false);
      }
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/print/orders/${orderId}`}
          target="_blank"
          rel="noopener"
          className="inline-flex items-center gap-2 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <Printer className="h-4 w-4" aria-hidden />
          Print invoice
        </a>

        {/* Send Receipt */}
        <button
          type="button"
          disabled={sendingReceipt}
          onClick={() => {
            setNotice(null);
            startReceipt(async () => setNotice(await sendOrderReceiptAction(orderId)));
          }}
          className="inline-flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors"
          title={`Send official purchase receipt for ${orderNumber} via SMS and Email`}
        >
          {sendingReceipt ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4 text-[var(--accent)]" aria-hidden />}
          Send receipt
        </button>

        {/* Custom Message */}
        <button
          type="button"
          onClick={() => setShowCustomModal((prev) => !prev)}
          className="inline-flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)] transition-colors"
          title={`Send a direct custom SMS/email update for ${orderNumber}`}
        >
          <MessageSquare className="h-4 w-4 text-emerald-600" aria-hidden />
          Custom message
        </button>

        {/* Resend Notice */}
        <button
          type="button"
          disabled={resending}
          onClick={() => {
            setNotice(null);
            startResend(async () => setNotice(await resendOrderNoticeAction(orderId)));
          }}
          className="inline-flex items-center gap-2 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--surface-sunken)] disabled:opacity-50 transition-colors"
          title={`Text and email the customer about ${orderNumber} again`}
        >
          {resending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
          Resend status
        </button>
      </div>

      {notice?.message ? (
        <span className={`text-xs ${notice.ok ? "text-emerald-600 font-medium" : "text-danger"}`}>
          {notice.message}
        </span>
      ) : null}

      {/* Custom Message Modal / Form */}
      {showCustomModal && (
        <Card className="flex flex-col gap-3 p-4 border-[var(--accent)]/40 bg-[var(--surface-sunken)] animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
              <MessageSquare className="h-3.5 w-3.5 text-emerald-600" />
              <span>Send Direct Message to Customer (#{orderNumber})</span>
            </div>
            <button
              type="button"
              onClick={() => setShowCustomModal(false)}
              className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <form onSubmit={handleCustomSend} className="flex flex-col gap-3">
            <textarea
              rows={3}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              placeholder="e.g. Your bespoke duvet set is ready for station delivery. Our rider will contact you upon dispatch..."
              className="lx-field text-xs resize-y"
              autoFocus
              required
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">
                Dispatches immediately via Vynfy SMS and SMTP Email.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomModal(false)}
                  className="rounded-md border border-[var(--border-subtle)] px-2.5 py-1 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-raised)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingCustom || !customText.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1 text-xs font-medium text-[var(--accent-contrast)] hover:opacity-90 disabled:opacity-50"
                >
                  {sendingCustom ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send Message
                </button>
              </div>
            </div>
          </form>
        </Card>
      )}
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
