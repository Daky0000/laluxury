"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { addToCartAction } from "@/app/actions/cart";

/**
 * One-tap add from the product grid, for products with a single variant.
 * Shows its own success and error state so the shopper never loses their
 * place in the grid.
 */
export function QuickBuy({ variantId }: { variantId: string }) {
  const [pending, startTransition] = useTransition();
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function add() {
    setError(null);
    startTransition(async () => {
      const result = await addToCartAction(variantId, 1);
      if (result.ok) {
        setAdded(true);
        setTimeout(() => setAdded(false), 2000);
      } else {
        setError(result.message ?? "Could not add that.");
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={add}
        disabled={pending}
        className="flex items-center gap-2 rounded-full bg-ink-900/95 px-5 py-2.5 text-xs font-medium tracking-wide text-white shadow-lg backdrop-blur transition-colors hover:bg-ink-800 disabled:opacity-70"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        ) : added ? (
          <Check className="h-3.5 w-3.5" aria-hidden />
        ) : null}
        {added ? "Added to bag" : "Quick buy"}
      </button>

      {error ? (
        <span role="alert" className="rounded bg-danger px-2 py-1 text-[11px] text-white">
          {error}
        </span>
      ) : null}
    </div>
  );
}
