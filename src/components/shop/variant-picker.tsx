"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Loader2, Minus, Plus } from "lucide-react";
import { addToCartAction } from "@/app/actions/cart";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Option-driven variant selection.
 *
 * The picker resolves a variant from the selected option values rather than
 * making the shopper pick a variant directly, and greys out combinations that
 * do not exist so they cannot select their way into a dead end.
 */

export type PickerOption = {
  id: string;
  name: string;
  values: { id: string; value: string; hexColor: string | null }[];
};

export type PickerVariant = {
  id: string;
  title: string;
  sku: string;
  price: number;
  compareAtPrice: number | null;
  optionValueIds: string[];
  available: number | null;
};

export function VariantPicker({
  options,
  variants,
  onVariantChange,
}: {
  options: PickerOption[];
  variants: PickerVariant[];
  onVariantChange?: (variantId: string) => void;
}) {
  // Start on the first variant that can actually be bought.
  const initial = variants.find((v) => v.available === null || v.available > 0) ?? variants[0];

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    if (!initial) return map;
    for (const option of options) {
      const match = option.values.find((v) => initial.optionValueIds.includes(v.id));
      if (match) map[option.id] = match.id;
    }
    return map;
  });

  const [quantity, setQuantity] = useState(1);
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeVariant = useMemo(() => {
    if (options.length === 0) return variants[0] ?? null;
    const chosen = Object.values(selected);
    if (chosen.length !== options.length) return null;
    return (
      variants.find((v) => chosen.every((id) => v.optionValueIds.includes(id))) ?? null
    );
  }, [options.length, selected, variants]);

  /** A value is reachable if some variant pairs it with the other choices. */
  function isReachable(optionId: string, valueId: string): boolean {
    const others = Object.entries(selected).filter(([key]) => key !== optionId);
    return variants.some(
      (v) =>
        v.optionValueIds.includes(valueId) &&
        others.every(([, id]) => v.optionValueIds.includes(id)) &&
        (v.available === null || v.available > 0),
    );
  }

  function choose(optionId: string, valueId: string) {
    setError(null);
    setSelected((prev) => {
      const next = { ...prev, [optionId]: valueId };
      const chosen = Object.values(next);
      const match = variants.find((v) => chosen.every((id) => v.optionValueIds.includes(id)));
      if (match) onVariantChange?.(match.id);
      return next;
    });
  }

  const maxQuantity = activeVariant?.available ?? 99;
  const soldOut = activeVariant !== null && activeVariant.available === 0;

  function add() {
    if (!activeVariant) {
      setError("Choose an option first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addToCartAction(activeVariant.id, quantity);
      if (result.ok) {
        setAdded(true);
        setTimeout(() => setAdded(false), 2500);
      } else {
        setError(result.message ?? "Could not add that to your bag.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {activeVariant ? (
        <div className="flex items-baseline gap-3">
          <p className="font-display text-3xl tabular-nums">{formatMoney(activeVariant.price)}</p>
          {activeVariant.compareAtPrice && activeVariant.compareAtPrice > activeVariant.price ? (
            <p className="text-sm text-[var(--text-muted)] line-through tabular-nums">
              {formatMoney(activeVariant.compareAtPrice)}
            </p>
          ) : null}
        </div>
      ) : null}

      {options.map((option) => {
        const isColour = option.values.some((v) => v.hexColor);
        return (
          <fieldset key={option.id}>
            <legend className="lx-eyebrow mb-2">
              {option.name}
              {selected[option.id] ? (
                <span className="ml-2 normal-case tracking-normal text-[var(--text-primary)]">
                  {option.values.find((v) => v.id === selected[option.id])?.value}
                </span>
              ) : null}
            </legend>

            <div className="flex flex-wrap gap-2">
              {option.values.map((value) => {
                const isSelected = selected[option.id] === value.id;
                const reachable = isReachable(option.id, value.id);

                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() => choose(option.id, value.id)}
                    aria-pressed={isSelected}
                    title={reachable ? value.value : `${value.value} — unavailable`}
                    className={cn(
                      "relative transition-all",
                      isColour
                        ? "h-9 w-9 rounded-full border"
                        : "rounded-[--radius-card] border px-3.5 py-2 text-sm",
                      isSelected
                        ? "border-[var(--accent)] ring-1 ring-[var(--accent)]"
                        : "border-[var(--border-subtle)] hover:border-[var(--text-muted)]",
                      !reachable && "opacity-35",
                    )}
                    style={isColour ? { backgroundColor: value.hexColor ?? undefined } : undefined}
                  >
                    {isColour ? <span className="sr-only">{value.value}</span> : value.value}
                    {!reachable ? (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute inset-0 flex items-center justify-center"
                      >
                        <span className="h-px w-full rotate-[-20deg] bg-[var(--text-muted)]" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {activeVariant ? (
        <p className="text-xs text-[var(--text-secondary)]">
          SKU {activeVariant.sku}
          {activeVariant.available !== null ? (
            activeVariant.available > 0 ? (
              activeVariant.available <= 5 ? (
                <span className="ml-2 text-warning">
                  Only {activeVariant.available} left
                </span>
              ) : (
                <span className="ml-2 text-success">In stock</span>
              )
            ) : (
              <span className="ml-2 text-danger">Sold out</span>
            )
          ) : null}
        </p>
      ) : (
        <p className="text-xs text-[var(--text-secondary)]">
          That combination is not available — try another.
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="flex items-center rounded-[--radius-card] border border-[var(--border-subtle)]">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="px-3 py-3 text-[var(--text-secondary)] disabled:opacity-30"
            aria-label="Decrease quantity"
          >
            <Minus className="h-4 w-4" aria-hidden />
          </button>
          <span className="w-10 text-center text-sm tabular-nums" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            disabled={quantity >= maxQuantity}
            className="px-3 py-3 text-[var(--text-secondary)] disabled:opacity-30"
            aria-label="Increase quantity"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onClick={add}
          disabled={pending || soldOut || !activeVariant}
          className="flex flex-1 items-center justify-center gap-2 rounded-[--radius-card] bg-[var(--accent)] px-6 py-3.5 text-sm tracking-wide text-[var(--accent-contrast)] transition-colors hover:bg-ink-800 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {added ? <Check className="h-4 w-4" aria-hidden /> : null}
          {soldOut ? "Sold out" : added ? "Added to bag" : "Add to bag"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
