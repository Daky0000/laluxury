"use client";

import { useActionState, useMemo, useState } from "react";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { createManualOrderAction } from "@/app/actions/admin/manual-orders";
import type { AdminState } from "@/app/actions/admin/products";
import { GHANA_REGIONS } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { Card, Alert } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * Raising an order from the console.
 *
 * Shops here take a great deal of business over WhatsApp and across the
 * counter, and those orders still have to exist — for stock, for the customer's
 * history, and so the day's takings are the real number.
 */

export type SellableVariant = {
  id: string;
  label: string;
  price: number;
  available: number | null;
};

type Line = { variantId: string; quantity: number };

const field = "lx-field rounded-lg text-sm";
const label = "flex flex-col gap-1.5 text-xs text-[var(--text-muted)]";

export function ManualOrderPanel({ variants }: { variants: SellableVariant[] }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex w-fit items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-[12.5px] text-white transition-colors hover:bg-[var(--accent-hover)]"
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
        {open ? "Close" : "New order"}
      </button>

      {open ? (
        <Card className="px-6 py-5.5">
          <ManualOrderForm variants={variants} onDone={() => setOpen(false)} />
        </Card>
      ) : (
        <p className="text-[13px] text-[var(--text-secondary)]">
          For business that arrives over WhatsApp, by phone or across the counter. Orders raised
          here behave exactly as checkout orders do, and attach to the customer automatically when
          their email already has an account.
        </p>
      )}
    </div>
  );
}

function ManualOrderForm({
  variants,
  onDone,
}: {
  variants: SellableVariant[];
  onDone: () => void;
}) {
  const [lines, setLines] = useState<Line[]>([]);
  const [picking, setPicking] = useState(variants[0]?.id ?? "");

  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      formData.set("lines", JSON.stringify(lines));
      const result = await createManualOrderAction(prev, formData);
      if (result.ok) {
        setLines([]);
        onDone();
      }
      return result;
    },
    null,
  );

  const byId = useMemo(
    () => new Map(variants.map((variant) => [variant.id, variant])),
    [variants],
  );

  const subtotal = lines.reduce(
    (sum, line) => sum + (byId.get(line.variantId)?.price ?? 0) * line.quantity,
    0,
  );

  function addLine() {
    if (!picking) return;
    setLines((current) => {
      const existing = current.find((line) => line.variantId === picking);
      if (existing) {
        return current.map((line) =>
          line.variantId === picking ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { variantId: picking, quantity: 1 }];
    });
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      {/* Lines */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">What they are buying</h3>

        <div className="flex flex-wrap items-end gap-2.5">
          <label className={cn(label, "min-w-64 flex-1")}>
            Product
            <select
              value={picking}
              onChange={(event) => setPicking(event.target.value)}
              className={cn(field, "cursor-pointer")}
            >
              {variants.map((variant) => (
                <option key={variant.id} value={variant.id}>
                  {variant.label} — {formatMoney(variant.price)}
                  {variant.available !== null ? ` (${variant.available} in stock)` : ""}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-4 py-2.5 text-[12.5px] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add line
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="text-[13px] text-[var(--text-muted)]">No lines yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {lines.map((line) => {
              const variant = byId.get(line.variantId);
              return (
                <li
                  key={line.variantId}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-subtle)] px-3.5 py-2.5 text-sm"
                >
                  <span className="min-w-40 flex-1">{variant?.label ?? "Removed product"}</span>

                  <input
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(event) =>
                      setLines((current) =>
                        current.map((entry) =>
                          entry.variantId === line.variantId
                            ? { ...entry, quantity: Math.max(1, Number(event.target.value) || 1) }
                            : entry,
                        ),
                      )
                    }
                    className="w-20 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2 py-1 text-sm tabular-nums"
                    aria-label={`Quantity of ${variant?.label ?? "line"}`}
                  />

                  <span className="w-24 text-right tabular-nums">
                    {formatMoney((variant?.price ?? 0) * line.quantity)}
                  </span>

                  <button
                    type="button"
                    onClick={() =>
                      setLines((current) =>
                        current.filter((entry) => entry.variantId !== line.variantId),
                      )
                    }
                    className="text-danger"
                    aria-label="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {lines.length > 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Subtotal <span className="tabular-nums">{formatMoney(subtotal)}</span>
          </p>
        ) : null}
      </section>

      {/* Customer */}
      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Who it is for</h3>
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
            <input name="phone" type="tel" required placeholder="024 000 0000" className={field} />
          </label>
          <label className={cn(label, "sm:col-span-2")}>
            Delivery address
            <input name="line1" required className={field} />
          </label>
          <label className={label}>
            City or town
            <input name="city" required className={field} />
          </label>
          <label className={label}>
            Region
            <select name="region" required defaultValue="Greater Accra" className={cn(field, "cursor-pointer")}>
              {GHANA_REGIONS.map((region) => (
                <option key={region} value={region}>
                  {region}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Terms */}
      <section className="grid gap-4 sm:grid-cols-2">
        <label className={label}>
          Delivery charge (₵)
          <input name="shipping" inputMode="decimal" defaultValue="0" className={field} />
        </label>
        <label className={label}>
          How it came in
          <select name="channel" defaultValue="WhatsApp" className={cn(field, "cursor-pointer")}>
            <option value="WhatsApp">WhatsApp</option>
            <option value="Phone">Phone</option>
            <option value="Showroom">Showroom</option>
            <option value="Instagram">Instagram</option>
            <option value="console">Other</option>
          </select>
        </label>
        <label className={cn(label, "sm:col-span-2")}>
          Note for staff
          <input name="staffNote" placeholder="Optional" className={field} />
        </label>

        <label className="flex items-start gap-2.5 text-sm sm:col-span-2">
          <input type="checkbox" name="markPaid" className="mt-1 accent-[var(--accent)]" />
          <span>
            Already paid
            <span className="mt-0.5 block text-xs text-[var(--text-muted)]">
              Ticking this marks the order paid and takes the stock immediately. Leave it clear for
              cash on delivery and mark it paid when the money arrives.
            </span>
          </span>
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || lines.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-3 text-[12.5px] text-white disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Create order
        </button>
        <button type="button" onClick={onDone} className="text-[12.5px] text-[var(--text-secondary)]">
          Cancel
        </button>
      </div>
    </form>
  );
}
