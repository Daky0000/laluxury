"use client";

import { useActionState, useState, useTransition } from "react";
import { Loader2, Plus, X, Trash2 } from "lucide-react";
import { createCustomerAction, deleteCustomerAction } from "@/app/actions/admin/people";
import type { AdminState } from "@/app/actions/admin/products";
import { Card, Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Adding a customer by hand, for someone who ordered over WhatsApp or walked
 * into the showroom and should exist here before their first online order.
 */

const field = "lx-field rounded-lg text-sm";
const label = "flex flex-col gap-1.5 text-xs text-[var(--text-muted)]";

export function AddCustomerPanel() {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await createCustomerAction(prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[12.5px] text-white transition-colors hover:bg-[var(--accent-hover)]"
        >
          {open ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
          {open ? "Close" : "Add customer"}
        </button>
      </div>

      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {open ? (
        <Card className="px-6 py-5.5">
          <form action={action} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className={label}>
                First name
                <input name="firstName" required className={field} />
              </label>
              <label className={label}>
                Last name
                <input name="lastName" className={field} />
              </label>
              <label className={label}>
                Email
                <input name="email" type="email" required className={field} />
              </label>
              <label className={label}>
                Phone
                <input name="phone" type="tel" placeholder="024 000 0000" className={field} />
              </label>
              <label className={cn(label, "sm:col-span-2")}>
                Notes
                <input name="notes" placeholder="Optional" className={field} />
              </label>
              <label className="flex items-center gap-2.5 text-sm sm:col-span-2">
                <input type="checkbox" name="acceptsMarketing" className="accent-[var(--accent)]" />
                Happy to receive marketing
              </label>
            </div>

            <p className="text-xs text-[var(--text-muted)]">
              No password is set, so this account cannot be signed into until they reset it
              themselves.
            </p>

            <button
              type="submit"
              disabled={pending}
              className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-[12.5px] text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Add customer
            </button>
          </form>
        </Card>
      ) : null}
    </div>
  );
}

/** Removes a customer; anyone with orders is switched off rather than deleted. */
export function RemoveCustomerButton({ userId, name }: { userId: string; name: string }) {
  const [removing, startRemoving] = useTransition();
  const [notice, setNotice] = useState<AdminState | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (notice?.message) {
    return (
      <span className={cn("text-xs", notice.ok ? "text-sage-600" : "text-danger")}>
        {notice.message}
      </span>
    );
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[var(--text-muted)] transition-colors hover:text-danger"
        aria-label={`Remove ${name}`}
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <button
        type="button"
        disabled={removing}
        onClick={() => startRemoving(async () => setNotice(await deleteCustomerAction(userId)))}
        className="text-danger underline underline-offset-2 disabled:opacity-50"
      >
        {removing ? "Removing…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-[var(--text-secondary)]"
      >
        Cancel
      </button>
    </span>
  );
}
