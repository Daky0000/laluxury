"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { adjustStockAction } from "@/app/actions/admin/catalog-ops";
import { cn } from "@/lib/utils";

/**
 * One inventory line with an inline adjuster.
 *
 * "Receive" adds units (a delivery arriving); "Set" writes an absolute count
 * (a stock take). Both land in the ledger with a reason attached.
 */
export function StockRow({
  variantId,
  productId,
  productTitle,
  variantTitle,
  sku,
  onHand,
  reserved,
  reorderPoint,
  trackInventory,
  canWrite,
}: {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  onHand: number;
  reserved: number;
  reorderPoint: number;
  trackInventory: boolean;
  canWrite: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"add" | "set">("add");
  const [quantity, setQuantity] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = onHand - reserved;

  function submit() {
    const value = Number(quantity);
    if (!Number.isFinite(value)) {
      setError("Enter a number.");
      return;
    }

    setError(null);
    const formData = new FormData();
    formData.set("variantId", variantId);
    formData.set("mode", mode);
    formData.set("quantity", String(value));
    formData.set("reason", mode === "add" ? "Delivery received" : "Stock take");

    startTransition(async () => {
      const result = await adjustStockAction(null, formData);
      if (result.ok) {
        setQuantity("");
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      } else {
        setError(result.message ?? "Could not update.");
      }
    });
  }

  return (
    <tr className="hover:bg-[var(--surface-sunken)]">
      <td className="px-4 py-3">
        <Link href={`/admin/products/${productId}`} className="hover:underline">
          {productTitle}
        </Link>
        {variantTitle !== "Default" ? (
          <span className="block text-xs text-[var(--text-secondary)]">{variantTitle}</span>
        ) : null}
      </td>

      <td className="px-3 py-3 font-mono text-xs">{sku}</td>
      <td className="px-3 py-3 tabular-nums">{onHand}</td>
      <td className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">{reserved}</td>

      <td className="px-3 py-3">
        {!trackInventory ? (
          <span className="text-[var(--text-muted)]">Untracked</span>
        ) : (
          <span
            className={cn(
              "tabular-nums",
              available <= 0 ? "text-danger" : available <= reorderPoint ? "text-warning" : "",
            )}
          >
            {available}
          </span>
        )}
      </td>

      <td className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">{reorderPoint}</td>

      {canWrite ? (
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor={`mode-${variantId}`} className="sr-only">
              Adjustment mode for {sku}
            </label>
            <select
              id={`mode-${variantId}`}
              value={mode}
              onChange={(event) => setMode(event.target.value as "add" | "set")}
              className="lx-field w-24 py-1 text-xs"
            >
              <option value="add">Receive</option>
              <option value="set">Set to</option>
            </select>

            <label htmlFor={`qty-${variantId}`} className="sr-only">
              Quantity for {sku}
            </label>
            <input
              id={`qty-${variantId}`}
              type="number"
              min="0"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") submit();
              }}
              placeholder="0"
              className="lx-field w-16 py-1 text-xs"
            />

            <button
              type="button"
              onClick={submit}
              disabled={pending || quantity === ""}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-2.5 py-1 text-xs disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : done ? (
                <Check className="h-3 w-3 text-success" aria-hidden />
              ) : (
                "Go"
              )}
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-1 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}
