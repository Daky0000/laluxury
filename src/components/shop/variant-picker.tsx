"use client";

import { useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Check, Heart, Loader2, X } from "lucide-react";
import { bulkAddToCartAction, buyNowAction } from "@/app/actions/cart";
import { toggleWishlistAction } from "@/app/actions/misc";
import { openBag } from "./bag-events";
import { formatPrice } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Photo } from "./photo";

/**
 * Option-driven variant selection, laid out as the product artboard has it:
 * price with its saving, a stock line, then one group of choices per option —
 * swatches for colours, labelled cards carrying their own price for the rest.
 *
 * The picker resolves a variant from the selected option values rather than
 * making the shopper pick a variant directly, and greys out combinations that
 * do not exist so they cannot select their way into a dead end.
 *
 * Nothing is chosen for the shopper. Landing on a preselected colour makes the
 * page look decided, hides the price range and swaps the gallery to one
 * variant's photography before anyone has asked for it — so the picker opens
 * empty, shows what the range costs, and waits.
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

/** "a colour", "a colour and a size" — read out in the order they are shown. */
function listNames(names: string[]): string {
  const lower = names.map((name) => `a ${name.toLowerCase()}`);
  if (lower.length <= 1) return lower[0] ?? "an option";
  return `${lower.slice(0, -1).join(", ")} and ${lower[lower.length - 1]}`;
}

/**
 * Why a call to action will not fire, said on hover and on focus.
 *
 * A greyed-out button with nothing to explain it is how a product page loses a
 * sale: the shopper cannot tell whether the piece is sold out or whether they
 * simply have not picked a size yet. So the buttons stay hoverable, name the
 * choice that is missing, and repeat it in the error line if clicked anyway.
 */
function BlockedHint({ id, reason }: { id: string; reason: string }) {
  return (
    <span
      id={id}
      role="tooltip"
      className="pointer-events-none absolute bottom-[calc(100%+10px)] left-1/2 z-20 w-max max-w-[240px] -translate-x-1/2 bg-[var(--text-primary)] px-3 py-2 text-sm font-normal normal-case leading-snug tracking-normal text-[var(--surface-raised)] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
    >
      {reason}
      <span
        aria-hidden
        className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1 rotate-45 bg-[var(--text-primary)]"
      />
    </span>
  );
}

export function VariantPicker({
  options,
  variants,
  onSelectionChange,
  valueImages,
  productId,
  isSaved,
  description,
}: {
  options: PickerOption[];
  variants: PickerVariant[];
  /** First photograph tied to each option value, keyed by value id. */
  valueImages?: Record<string, string>;
  /** Every option value picked so far, so the gallery can follow along. */
  onSelectionChange?: (valueIds: string[]) => void;
  productId: string;
  isSaved: boolean;
  description?: ReactNode;
}) {
  const router = useRouter();
  const hintId = useId();

  // Empty on purpose: the shopper chooses, we do not choose for them.
  const [selected, setSelected] = useState<Record<string, string>>({});

  /**
   * How many of each variant the shopper has lined up, keyed by variant id.
   *
   * This is the basket-before-the-basket. Someone buying blinds for a house
   * wants four of the 5ft in ash and two of the 7ft in wine, and having to add
   * one, wait for the drawer, come back and add the other is how you lose the
   * second line. Setting a quantity queues it; changing option resets the
   * stepper to whatever that variant is on, which for an untouched one is zero.
   */
  const [queued, setQueued] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [buying, startBuying] = useTransition();
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
      const next = { ...prev };
      // Tapping the chosen value again clears it, which is the only way back
      // to the full gallery and the range price.
      if (next[optionId] === valueId) delete next[optionId];
      else next[optionId] = valueId;

      onSelectionChange?.(Object.values(next));
      return next;
    });
  }

  /** What the range costs, shown until a variant is settled. */
  const priceRange = useMemo(() => {
    const prices = variants.map((v) => v.price);
    if (prices.length === 0) return null;
    return { min: Math.min(...prices), max: Math.max(...prices) };
  }, [variants]);

  /** Option groups still waiting on a choice, named as the shopper sees them. */
  const awaiting = options.filter((option) => !selected[option.id]);

  /** Value id to the words a shopper recognises, for the queued lines below. */
  const valueById = useMemo(() => {
    const map = new Map<string, { optionName: string; value: string; hexColor: string | null }>();
    for (const option of options) {
      for (const value of option.values) {
        map.set(value.id, {
          optionName: option.name,
          value: value.value,
          hexColor: value.hexColor,
        });
      }
    }
    return map;
  }, [options]);

  const maxQuantity = activeVariant?.available ?? 99;
  const soldOut = activeVariant !== null && activeVariant.available === 0;

  /** The stepper always reads the current variant's own count, zero if new. */
  const quantity = activeVariant ? (queued[activeVariant.id] ?? 0) : 0;

  function setQuantity(next: number) {
    if (!activeVariant) return;
    setError(null);
    setAdded(false);
    const clamped = Math.max(0, Math.min(next, activeVariant.available ?? 99));
    setQueued((prev) => {
      const copy = { ...prev };
      // Zero is a removal, not a line of nothing.
      if (clamped === 0) delete copy[activeVariant.id];
      else copy[activeVariant.id] = clamped;
      return copy;
    });
  }

  /** Queued lines, in the order the option values are shown. */
  const lines = useMemo(
    () =>
      variants
        .filter((v) => (queued[v.id] ?? 0) > 0)
        .map((v) => ({ variant: v, quantity: queued[v.id] })),
    [queued, variants],
  );

  const totalItems = lines.reduce((sum, line) => sum + line.quantity, 0);
  const totalPrice = lines.reduce((sum, line) => sum + line.quantity * line.variant.price, 0);
  const isBulk = lines.length > 1;
  const compareAt = activeVariant?.compareAtPrice ?? null;
  const saving = activeVariant && compareAt && compareAt > activeVariant.price
    ? compareAt - activeVariant.price
    : 0;

  /**
   * What stands between the shopper and a purchase, in the order they meet it:
   * the options still unchosen -- named, so it reads "Choose a size" and never
   * "Choose an option" -- then a combination nobody stocks, then no stock.
   */
  const blockedFromBuying =
    awaiting.length > 0
      ? `Choose ${listNames(awaiting.map((option) => option.name))} first.`
      : !activeVariant
        ? "That combination is not available - try another."
        : soldOut
          ? "This one is out of stock."
          : null;

  /** The bag also needs a quantity, which quick order takes as one. */
  const blockedFromBag =
    lines.length > 0
      ? null
      : (blockedFromBuying ?? "Set a quantity - tap + or type a number.");

  function add() {
    if (blockedFromBag) {
      setError(blockedFromBag);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await bulkAddToCartAction(
        lines.map((line) => ({ variantId: line.variant.id, quantity: line.quantity })),
      );
      if (!result.ok) {
        setError(result.message ?? "Could not add that to your bag.");
        return;
      }
      // The queue has moved into the bag; leaving it on screen would invite
      // adding the same run of blinds a second time.
      setQueued({});
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
      openBag();
      router.refresh();
    });
  }

  /** Quick order: straight from here to the payment screen. */
  function buyNow() {
    if (blockedFromBuying || !activeVariant) {
      setError(blockedFromBuying ?? "Choose an option first.");
      return;
    }
    const variant = activeVariant;
    setError(null);
    startBuying(async () => {
      // On success this redirects, so anything returned is a failure.
      const result = await buyNowAction(variant.id, Math.max(1, quantity));
      if (result && !result.ok) setError(result.message ?? "Could not start that order.");
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
        <span className="text-[38px] font-semibold leading-none tabular-nums">
          {activeVariant
            ? formatPrice(activeVariant.price)
            : priceRange
              ? priceRange.min === priceRange.max
                ? formatPrice(priceRange.min)
                : `${formatPrice(priceRange.min)} – ${formatPrice(priceRange.max)}`
              : "—"}
        </span>
        {saving > 0 && compareAt ? (
          <>
            <span className="text-[17px] text-ink-400 line-through tabular-nums">
              {formatPrice(compareAt)}
            </span>
            <span className="bg-[var(--accent)] px-2.5 py-1 text-sm uppercase tracking-[0.08em] text-[var(--accent-contrast)]">
              Save {formatPrice(saving)}
            </span>
          </>
        ) : null}
      </div>

      {/* Stock line */}
      <p className="mt-2 text-sm font-medium">
        {!activeVariant && awaiting.length > 0 ? (
          <span className="text-[var(--text-secondary)]">
            Choose {listNames(awaiting.map((option) => option.name))} to see the price and stock.
          </span>
        ) : !activeVariant ? (
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
        const hasThumbnails = option.values.some((value) => valueImages?.[value.id]);
        // Ten patterns of a rug should not push the price and the bag button
        // off the screen: past two rows the group scrolls in place.
        const crowded = option.values.length > 8;

        return (
          <fieldset key={option.id} className="mt-7">
            <legend className="mb-3 text-sm uppercase tracking-[0.16em] text-[var(--text-secondary)]">
              {option.name}
              {chosenValue ? (
                <span className="font-medium normal-case tracking-normal text-[var(--text-primary)]">
                  {" — "}
                  {chosenValue.value}
                </span>
              ) : (
                <span className="normal-case tracking-normal text-[var(--text-muted)]">
                  {" — choose one"}
                </span>
              )}
            </legend>

            <div
              className={cn(
                "flex flex-wrap gap-3",
                crowded && "overflow-y-auto pr-1",
                crowded && (hasThumbnails ? "max-h-[268px]" : isColour ? "max-h-[112px]" : "max-h-[164px]"),
              )}
            >
              {option.values.map((value) => {
                const isSelected = selected[option.id] === value.id;
                const reachable = isReachable(option.id, value.id);
                const valuePrice = priceOf(value.id);
                // A value with its own photograph shows it: on a rug in ten
                // patterns, "1" and "2" are not choices anyone can make.
                const thumbnail = valueImages?.[value.id] ?? null;

                return (
                  <button
                    key={value.id}
                    type="button"
                    onClick={() => choose(option.id, value.id)}
                    aria-pressed={isSelected}
                    title={reachable ? value.value : `${value.value} — unavailable`}
                    className={cn(
                      "relative border transition-all",
                      isColour
                        ? "h-11 w-11 overflow-hidden rounded-full"
                        : thumbnail
                          ? "flex w-[104px] flex-col items-center justify-start overflow-hidden p-0"
                          : "flex min-w-[104px] flex-col items-center justify-center px-4 py-3",
                      // The chosen value has to be obvious at a glance: a ring
                      // that clears the swatch, and a tick on top of it.
                      isSelected
                        ? "border-[var(--accent)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface)]"
                        : "border-[var(--border-strong)] hover:border-[var(--text-muted)]",
                      isSelected && !isColour && "bg-[var(--surface-raised)]",
                      !reachable && "opacity-35",
                    )}
                    style={
                      isColour ? { backgroundColor: value.hexColor ?? undefined } : undefined
                    }
                  >
                    {isColour ? (
                      <>
                        {thumbnail ? <Photo src={thumbnail} sizes="44px" /> : null}
                        <span className="sr-only">{value.value}</span>
                      </>
                    ) : (
                      <>
                        {thumbnail ? (
                          <span className="relative block h-[72px] w-full bg-[var(--surface-media)]">
                            <Photo src={thumbnail} sizes="104px" />
                          </span>
                        ) : null}
                        <span className={cn("text-sm font-medium", thumbnail && "mt-2")}>
                          {value.value}
                        </span>
                        {valuePrice !== null ? (
                          <span
                            className={cn(
                              "mt-0.5 text-sm text-[var(--text-muted)] tabular-nums",
                              thumbnail && "mb-2.5",
                            )}
                          >
                            {formatPrice(valuePrice)}
                          </span>
                        ) : null}
                      </>
                    )}

                    {isSelected ? (
                      isColour ? (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-0 grid place-items-center"
                        >
                          <Check
                            className="h-4 w-4 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]"
                            strokeWidth={3}
                          />
                        </span>
                      ) : (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute -right-2 -top-2 grid h-5 w-5 place-items-center rounded-full bg-[var(--accent)] text-[var(--accent-contrast)]"
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )
                    ) : null}
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

      {/* How many of the variant on screen right now */}
      <div className="mt-7">
        <p className="mb-2.5 text-sm uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          Quantity
          {activeVariant ? (
            <span className="normal-case tracking-normal text-[var(--text-primary)]">
              {" — "}
              {activeVariant.title}
            </span>
          ) : null}
        </p>

        <div className="flex items-stretch gap-3.5">
          <div className="flex items-center gap-3 border border-[var(--border-strong)] px-3">
            <button
              type="button"
              onClick={() => setQuantity(quantity - 1)}
              disabled={!activeVariant || quantity <= 0}
              className="px-1 text-lg text-[var(--accent)] disabled:opacity-30"
              aria-label="Decrease quantity"
            >
              &minus;
            </button>

            {/* Typed as well as stepped: nobody taps + forty times. */}
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={maxQuantity}
              value={quantity}
              disabled={!activeVariant || soldOut}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                setQuantity(Number.isNaN(parsed) ? 0 : parsed);
              }}
              aria-label={
                activeVariant ? `Quantity of ${activeVariant.title}` : "Quantity"
              }
              className="w-12 border-0 bg-transparent p-0 text-center text-base tabular-nums outline-none [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            />

            <button
              type="button"
              onClick={() => setQuantity(quantity + 1)}
              disabled={!activeVariant || quantity >= maxQuantity}
              className="px-1 text-lg text-[var(--accent)] disabled:opacity-30"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>

          {/* Blocked rather than disabled: a disabled button swallows the
              hover, and with it the one explanation the shopper needs. */}
          <div className="group relative flex flex-1">
            <button
              type="button"
              onClick={add}
              disabled={pending}
              aria-disabled={blockedFromBag !== null}
              aria-describedby={blockedFromBag ? `${hintId}-bag` : undefined}
              className={cn(
                "flex w-full items-center justify-center gap-2 bg-[var(--accent)] px-6 py-4 text-sm font-medium uppercase tracking-[0.14em] text-[var(--accent-contrast)] transition-colors",
                blockedFromBag
                  ? "cursor-not-allowed opacity-50"
                  : "hover:bg-[var(--accent-hover)]",
                pending && "opacity-50",
              )}
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {added ? <Check className="h-4 w-4" aria-hidden /> : null}
              {added
                ? "Added to bag"
                : soldOut && lines.length === 0
                  ? "Out of stock"
                  : isBulk
                    ? `Add bulk to bag · ${totalItems}`
                    : "Add to bag"}
            </button>
            {blockedFromBag ? (
              <BlockedHint id={`${hintId}-bag`} reason={blockedFromBag} />
            ) : null}
          </div>

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

        {/*
          What is lined up so far. Only worth showing once there is more than
          one line — for a single one the stepper above already says it, and a
          list of one reads like a bug.
        */}
        {isBulk ? (
          <div className="mt-4 border border-[var(--border-subtle)]">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {lines.map((line) => {
                // What was actually chosen, spelled out: a queue of four reads
                // as four prices unless each line says which colour it is.
                const details = line.variant.optionValueIds
                  .map((id) => valueById.get(id))
                  .filter((detail) => detail !== undefined);
                const swatch = details.find((detail) => detail.hexColor)?.hexColor ?? null;

                return (
                <li
                  key={line.variant.id}
                  className="flex items-center gap-3 px-3.5 py-2.5 text-sm"
                >
                  {swatch ? (
                    <span
                      aria-hidden
                      className="h-4 w-4 shrink-0 rounded-full border border-[var(--border-strong)]"
                      style={{ backgroundColor: swatch }}
                    />
                  ) : null}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{line.variant.title}</span>
                    {details.length > 0 ? (
                      <span className="block truncate text-sm text-[var(--text-muted)]">
                        {details
                          .map((detail) => `${detail.optionName}: ${detail.value}`)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {line.quantity} × {formatPrice(line.variant.price)}
                  </span>
                  <span className="w-20 text-right tabular-nums">
                    {formatPrice(line.quantity * line.variant.price)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQueued((prev) => {
                        const copy = { ...prev };
                        delete copy[line.variant.id];
                        return copy;
                      })
                    }
                    className="text-[var(--text-muted)] transition-colors hover:text-danger"
                    aria-label={`Remove ${line.variant.title}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </li>
                );
              })}
            </ul>

            <div className="flex items-center justify-between border-t border-[var(--border-strong)] px-3.5 py-2.5 text-sm">
              <span className="text-[var(--text-secondary)]">
                {totalItems} {totalItems === 1 ? "item" : "items"} ready
              </span>
              <span className="font-medium tabular-nums">{formatPrice(totalPrice)}</span>
            </div>
          </div>
        ) : null}
      </div>

      {/* Quick order — skips the bag for a shopper who has already decided. */}
      <div className="group relative mt-3 flex">
        <button
          type="button"
          onClick={buyNow}
          disabled={buying || pending}
          aria-disabled={blockedFromBuying !== null}
          aria-describedby={blockedFromBuying ? `${hintId}-buy` : undefined}
          className={cn(
            "flex w-full items-center justify-center gap-2 border border-[var(--text-primary)] px-6 py-4 text-sm font-medium uppercase tracking-[0.14em] transition-colors",
            blockedFromBuying
              ? "cursor-not-allowed opacity-40"
              : "hover:bg-[var(--text-primary)] hover:text-[var(--surface-raised)]",
            (buying || pending) && "opacity-40",
          )}
        >
          {buying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Buy it now
        </button>
        {blockedFromBuying ? (
          <BlockedHint id={`${hintId}-buy`} reason={blockedFromBuying} />
        ) : null}
      </div>

      {activeVariant ? (
        <p className="mt-3 text-sm text-[var(--text-muted)]">SKU {activeVariant.sku}</p>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}

      {saveNote ? (
        <p role="status" className="mt-2 text-sm text-[var(--text-secondary)]">
          {saveNote}
        </p>
      ) : null}
    </div>
  );
}
