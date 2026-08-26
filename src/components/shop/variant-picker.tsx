"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Heart, Loader2 } from "lucide-react";
import { addToCartAction } from "@/app/actions/cart";
import { toggleWishlistAction } from "@/app/actions/misc";
import { openBag } from "./bag-events";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Option-driven variant selection, laid out as the product artboard has it:
 * price with its saving, a stock line, then one group of choices per option —
 * swatches for colours, labelled cards carrying their own price for the rest.
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
  productId,
  isSaved,
  description,
}: {
  options: PickerOption[];
  variants: PickerVariant[];
  onVariantChange?: (variantId: string) => void;
  productId: string;
  isSaved: boolean;
  description?: ReactNode;
}) {
  const router = useRouter();

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

  const [saved, setSaved] = useState(isSaved);
  const [savePending, startSaving] = useTransition();
  const [saveNote, setSaveNote] = useState<string | null>(null);

  const activeVariant = useMemo(() => {
    if (options.length === 0) return variants[0] ?? null;
    const chosen = Object.values(selected);
    if (chosen.length !== options.length) return null;
    return variants.find((v) => chosen.every((id) => v.optionValueIds.includes(id))) ?? null;
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

  /** Cheapest variant carrying this value, so a size card can price itself. */
  function priceOf(valueId: string): number | null {
    const prices = variants.filter((v) => v.optionValueIds.includes(valueId)).map((v) => v.price);
    return prices.length ? Math.min(...prices) : null;
  }

  function choose(optionId: string, valueId: string) {
    setError(null);
    setAdded(false);
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
  const compareAt = activeVariant?.compareAtPrice ?? null;
  const saving = activeVariant && compareAt && compareAt > activeVariant.price
    ? compareAt - activeVariant.price
    : 0;

  function add() {
    if (!activeVariant) {
      setError("Choose an option first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await addToCartAction(activeVariant.id, quantity);
      if (!result.ok) {
        setError(result.message ?? "Could not add that to your bag.");
        return;
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
      openBag();
      router.refresh();
    });
  }

  function toggleSave() {
    setSaveNote(null);
    startSaving(async () => {
      const result = await toggleWishlistAction(productId);
      if (!result.ok) {
        setSaveNote(result.message ?? "Could not save that.");
        return;
      }
      setSaved(result.saved);
    });
  }

  return (
    <div>
      {/* Price */}
      <div className="mt-5 flex flex-wrap items-baseline gap-3.5">
        <span className="font-display text-[38px] leading-none tabular-nums">
          {activeVariant ? formatPrice(activeVariant.price) : "—"}
        </span>
        {saving > 0 && compareAt ? (
          <>
            <span className="text-[17px] text-ink-400 line-through tabular-nums">
              {formatPrice(compareAt)}
            </span>
            <span className="bg-[var(--accent)] px-2.5 py-1 text-[10.5px] uppercase tracking-[0.08em] text-[var(--accent-contrast)]">
              Save {formatPrice(saving)}
            </span>
          </>
        ) : null}
      </div>

      {/* Stock line */}
      <p className="mt-2 text-[12.5px] font-medium">
        {!activeVariant ? (
          <span className="text-[var(--text-secondary)]">
            That combination is not available — try another.
          </span>
        ) : soldOut ? (
          <span className="text-danger">Out of stock</span>
        ) : activeVariant.available !== null && activeVariant.available <= 5 ? (
          <span className="text-warning">Only {activeVariant.available} left</span>
        ) : (
          <span className="text-sage-600">In stock · ships in 1–2 days</span>
        )}
      </p>

      {description}

      {/* Options */}
      {options.map((option) => {
        const isColour = option.values.some((v) => v.hexColor);
        const chosenValue = option.values.find((v) => v.id === selected[option.id]);

        return (
          <fieldset key={option.id} className="mt-7">
            <legend className="mb-3 text-[11.5px] uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              {option.name}
              {chosenValue ? (
                <span className="normal-case tracking-normal text-[var(--text-primary)]">
                  {" — "}
                  {chosenValue.value}
                </span>
              ) : null}
            </legend>

            <div className="flex flex-wrap gap-3">
              {option.values.map((value) => {
                const isSelected = selected[option.id] === value.id;
                const reachable = isReachable(option.id, value.id);
                const valuePrice = priceOf(value.id);

                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() => choose(option.id, value.id)}
                    aria-pressed={isSelected}
                    title={reachable ? value.value : `${value.value} — unavailable`}
                    className={cn(
                      "relative border transition-colors",
                      isColour
                        ? "h-11 w-11 rounded-full"
                        : "flex min-w-[104px] flex-col items-center justify-center px-4 py-3",
                      isSelected
                        ? "border-[var(--accent)] bg-[var(--surface-raised)]"
                        : "border-[var(--border-strong)] hover:border-[var(--text-muted)]",
                      !reachable && "opacity-35",
                    )}
                    style={isColour ? { backgroundColor: value.hexColor ?? undefined } : undefined}
                  >
                    {isColour ? (
                      <span className="sr-only">{value.value}</span>
                    ) : (
                      <>
                        <span className="text-[13.5px] font-medium">{value.value}</span>
                        {valuePrice !== null ? (
                          <span className="mt-0.5 text-[11.5px] text-[var(--text-muted)] tabular-nums">
                            {formatPrice(valuePrice)}
                          </span>
                        ) : null}
                      </>
                    )}
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

      {/* Quantity, add, save */}
      <div className="mt-8 flex items-stretch gap-3.5">
        <div className="flex items-center gap-4 border border-[var(--border-strong)] px-4">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            className="text-lg text-[var(--accent)] disabled:opacity-30"
            aria-label="Decrease quantity"
          >
            &minus;
          </button>
          <span className="min-w-4 text-center text-[15px] tabular-nums" aria-live="polite">
            {quantity}
          </span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
            disabled={quantity >= maxQuantity}
            className="text-lg text-[var(--accent)] disabled:opacity-30"
            aria-label="Increase quantity"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={add}
          disabled={pending || soldOut || !activeVariant}
          className="flex flex-1 items-center justify-center gap-2 bg-[var(--accent)] px-6 py-4 text-xs font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {added ? <Check className="h-4 w-4" aria-hidden /> : null}
          {soldOut ? "Out of stock" : added ? "Added to bag" : "Add to bag"}
        </button>

        <button
          type="button"
          onClick={toggleSave}
          disabled={savePending}
          aria-pressed={saved}
          className={cn(
            "grid w-[54px] place-items-center border text-[var(--accent)] transition-colors",
            saved ? "border-[var(--accent)]" : "border-[var(--border-strong)]",
          )}
        >
          {savePending ? (
            <Loader2 className="h-[19px] w-[19px] animate-spin" aria-hidden />
          ) : (
            <Heart
              className="h-[19px] w-[19px]"
              strokeWidth={1.5}
              fill={saved ? "currentColor" : "none"}
              aria-hidden
            />
          )}
          <span className="sr-only">{saved ? "Saved" : "Save for later"}</span>
        </button>
      </div>

      {activeVariant ? (
        <p className="mt-3 text-xs text-[var(--text-muted)]">SKU {activeVariant.sku}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {saveNote ? (
        <p role="status" className="mt-2 text-xs text-[var(--text-secondary)]">
          {saveNote}
        </p>
      ) : null}
    </div>
  );
}
