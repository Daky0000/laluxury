"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Plus, Zap } from "lucide-react";
import { addToCartAction, buyNowAction } from "@/app/actions/cart";
import { openBag } from "./bag-events";

type Props = {
  /** Null for products with more than one variant, or none in stock. */
  variantId: string | null;
  /** Product page, used when the shopper has to pick a size first. */
  href: string;
  label?: string;
  soldOut?: boolean;
};

/**
 * The wine "Add to bag" bar that slides up over a grid tile on hover.
 *
 * Multi-variant products cannot be added blind, so the same bar becomes a link
 * to the product page rather than disappearing and breaking the grid rhythm.
 */
export function AddToBag({ variantId, href, label = "Add to bag", soldOut = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [buying, startBuying] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const barClass =
    "absolute inset-x-3.5 bottom-3.5 flex items-center justify-center gap-2 px-3 py-3 text-[11px] font-medium uppercase tracking-[0.14em] transition-all duration-200 " +
    "translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 focus-visible:translate-y-0 focus-visible:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100";

  if (soldOut) {
    return (
      <span
        className={`${barClass} cursor-not-allowed bg-[rgba(26,26,24,0.75)] text-white`}
        aria-hidden
      >
        Sold out
      </span>
    );
  }

  if (!variantId) {
    return (
      <Link href={href} className={`${barClass} bg-[var(--accent)] text-white`}>
        {label === "Add to bag" ? "Choose size" : label}
      </Link>
    );
  }

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addToCartAction(variantId!, 1);
      if (!result.ok) {
        setError(result.message ?? "Could not add that.");
        return;
      }
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
      openBag();
      router.refresh();
    });
  }

  /** Quick order: adds the piece and hands straight over to checkout. */
  function buyNow() {
    setError(null);
    startBuying(async () => {
      const result = await buyNowAction(variantId!, 1);
      if (result && !result.ok) setError(result.message ?? "Could not start that order.");
    });
  }

  return (
    <>
      {/* Two actions in one bar: the bag for a shopper still browsing, and a
          quick order for one who has already decided. */}
      <span className={`${barClass} gap-0 p-0`}>
        <button
          type="button"
          onClick={add}
          disabled={pending || buying}
          className="flex flex-1 items-center justify-center gap-2 bg-[var(--accent)] px-3 py-3 text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-80"
        >
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : added ? (
            <Check className="h-3.5 w-3.5" aria-hidden />
          ) : null}
          {added ? "Added" : label}
        </button>

        <button
          type="button"
          onClick={buyNow}
          disabled={pending || buying}
          title="Buy now — straight to checkout"
          className="grid place-items-center border-l border-white/25 bg-[var(--accent)] px-3 py-3 text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-80"
        >
          {buying ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <Zap className="h-3.5 w-3.5" aria-hidden />
          )}
          <span className="sr-only">Buy now</span>
        </button>
      </span>

      {error ? (
        <span
          role="alert"
          className="absolute inset-x-3.5 bottom-16 bg-danger px-2 py-1 text-center text-[11px] text-white"
        >
          {error}
        </span>
      ) : null}
    </>
  );
}

/**
 * The compact outlined "+" used on the student essentials row, where the price
 * and the control share one line.
 */
export function AddToBagIcon({ variantId, href, soldOut = false }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);

  const shell =
    "grid h-8 w-8 place-items-center border border-sage-600 text-sage-700 transition-colors hover:bg-sage-600 hover:text-white disabled:opacity-50";

  if (soldOut) {
    return (
      <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Sold out
      </span>
    );
  }

  if (!variantId) {
    return (
      <Link href={href} className={shell} aria-label="Choose a size">
        <Plus className="h-[15px] w-[15px]" aria-hidden />
      </Link>
    );
  }

  function add() {
    startTransition(async () => {
      const result = await addToCartAction(variantId!, 1);
      if (!result.ok) return;
      setAdded(true);
      setTimeout(() => setAdded(false), 1800);
      openBag();
      router.refresh();
    });
  }

  return (
    <button type="button" onClick={add} disabled={pending} className={shell}>
      {pending ? (
        <Loader2 className="h-[15px] w-[15px] animate-spin" aria-hidden />
      ) : added ? (
        <Check className="h-[15px] w-[15px]" aria-hidden />
      ) : (
        <Plus className="h-[15px] w-[15px]" aria-hidden />
      )}
      <span className="sr-only">Add to bag</span>
    </button>
  );
}
