"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { saveDeliveryFeeAction } from "@/app/actions/admin/shipping";
import type { AdminState } from "@/app/actions/admin/products";
import { formatMoney, toMajorUnits } from "@/lib/money";
import { Card, Alert } from "@/components/ui";

/**
 * The one delivery fee. Every delivery order pays it, whatever the region;
 * pickup stays free. Saving takes effect at checkout on the web and in the
 * app straight away.
 */
export function DeliveryFeeForm({
  deliveryFee,
  freeShippingThreshold,
}: {
  deliveryFee: number;
  freeShippingThreshold: number | null;
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    saveDeliveryFeeAction,
    null,
  );

  return (
    <Card className="flex max-w-xl flex-col gap-4 px-6 py-5.5">
      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Delivery fee (GH₵)</span>
          <input
            name="deliveryFee"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            required
            defaultValue={toMajorUnits(deliveryFee)}
            className="lx-field max-w-48 rounded-lg text-sm"
          />
          <span className="text-xs text-[var(--text-muted)]">
            Charged once on every delivery order, to any region. Currently{" "}
            {deliveryFee === 0 ? "free" : formatMoney(deliveryFee)}. Pickup is always free.
          </span>
        </label>

        {freeShippingThreshold !== null ? (
          <p className="text-xs text-[var(--text-muted)]">
            Orders of {formatMoney(freeShippingThreshold)} or more still deliver free. Change or
            clear that under Settings → Free delivery threshold.
          </p>
        ) : null}

        {state?.message ? (
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save delivery fee
        </button>
      </form>
    </Card>
  );
}
