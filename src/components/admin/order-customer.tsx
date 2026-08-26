"use client";

import { useActionState, useState } from "react";
import { Loader2, UserPlus, Link2Off } from "lucide-react";
import { assignOrderCustomerAction } from "@/app/actions/admin/orders";
import type { AdminState } from "@/app/actions/admin/products";
import { Alert } from "@/components/ui";

/**
 * Attaching an order to a customer.
 *
 * Guest checkout and orders taken over WhatsApp arrive with no account behind
 * them, which leaves the customer's purchase history incomplete. This links the
 * two by email, and will create the customer from the order's own details when
 * there is no account yet.
 */
export function AssignOrderCustomer({
  orderId,
  defaultEmail,
  attached,
}: {
  orderId: string;
  defaultEmail: string;
  attached: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await assignOrderCustomerAction(orderId, prev, formData);
      if (result.ok) setOpen(false);
      return result;
    },
    null,
  );

  return (
    <div className="mt-3 flex flex-col gap-2.5 border-t border-[var(--border-subtle)] pt-3">
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {attached ? (
        <form action={action}>
          <input type="hidden" name="detach" value="1" />
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:text-danger disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Link2Off className="h-3.5 w-3.5" aria-hidden />
            )}
            Detach from this customer
          </button>
        </form>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)]"
        >
          <UserPlus className="h-3.5 w-3.5" aria-hidden />
          Assign to a customer
        </button>
      ) : (
        <form action={action} className="flex flex-col gap-2.5">
          <label className="flex flex-col gap-1.5 text-xs text-[var(--text-muted)]">
            Customer email
            <input
              name="email"
              type="email"
              defaultValue={defaultEmail}
              required
              className="lx-field rounded-lg text-sm"
            />
          </label>

          <label className="flex items-start gap-2 text-xs">
            <input type="checkbox" name="create" value="1" className="mt-0.5 accent-[var(--accent)]" />
            <span>
              Create the customer if there is no account yet
              <span className="mt-0.5 block text-[var(--text-muted)]">
                Built from this order&rsquo;s name and phone. No password is set.
              </span>
            </span>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs text-white disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
              Assign
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-[var(--text-secondary)]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
