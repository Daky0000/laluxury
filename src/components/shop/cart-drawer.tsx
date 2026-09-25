"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X, Loader2 } from "lucide-react";
import {
  cartSummaryAction,
  updateCartLineAction,
  type CartSummary,
} from "@/app/actions/cart";
import { formatPrice } from "@/lib/money";
import { useOverlay } from "@/lib/use-overlay";
import { BAG_OPEN_EVENT } from "./bag-events";

const EMPTY: CartSummary = { lines: [], itemCount: 0, subtotal: 0, deliveryLabel: "—" };

/**
 * The bag drawer from the storefront artboard. Mounted once in the shop
 * layout; anything that adds to the bag opens it by dispatching BAG_OPEN_EVENT.
 *
 * It reads the cart through a server action on open rather than being handed
 * cart state, so it can never disagree with what checkout will charge.
 */
export function CartDrawer() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<CartSummary>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await cartSummaryAction());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    function onOpen() {
      setOpen(true);
      void load();
    }
    window.addEventListener(BAG_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(BAG_OPEN_EVENT, onOpen);
  }, [load]);

  useOverlay(open, () => setOpen(false));

  function changeQuantity(itemId: string, quantity: number) {
    startTransition(async () => {
      await updateCartLineAction(itemId, quantity);
      await load();
      router.refresh();
    });
  }

  if (!open) return null;

  const busy = loading || pending;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Your bag">
      <button
        type="button"
        aria-label="Close bag"
        onClick={() => setOpen(false)}
        className="absolute inset-0 cursor-default bg-[rgba(43,39,36,0.4)]"
      />

      {/* `h-dvh` follows the visual viewport as a phone's toolbar slides away,
          so the checkout button at the foot is never left under it. */}
      <div className="absolute right-0 top-0 flex h-dvh w-[420px] max-w-[92vw] flex-col overscroll-contain border-l border-[var(--border-subtle)] bg-[var(--surface-raised)]">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-4 sm:px-6 sm:py-6">
          <h2 className="font-display text-2xl">Your bag</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="lx-tap-tight -mr-2.5 text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-1.5 sm:px-6">
          {busy && summary.lines.length === 0 ? (
            <div className="flex justify-center py-20 text-[var(--text-muted)]">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
            </div>
          ) : summary.lines.length === 0 ? (
            <p className="py-20 text-center text-sm font-light leading-7 text-[var(--text-muted)]">
              Your bag is empty.
              <br />
              Add something soft.
            </p>
          ) : (
            <ul>
              {summary.lines.map((line) => (
                <li
                  key={line.id}
                  className="flex gap-4 border-b border-[var(--border-subtle)] py-5"
                >
                  <div className="min-w-0 flex-1">
                    <Link href={`/product/${line.slug}`} onClick={() => setOpen(false)}>
                      <p className="text-base">{line.productTitle}</p>
                    </Link>
                    <p className="mt-0.5 text-sm font-light text-[var(--text-muted)]">
                      {formatPrice(line.unitPrice)} each
                      {line.variantTitle && line.variantTitle !== "Default"
                        ? ` · ${line.variantTitle}`
                        : ""}
                    </p>

                    <div className="mt-2.5 inline-flex items-center border border-[var(--border-subtle)]">
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.id, line.quantity - 1)}
                        disabled={pending}
                        className="lx-tap-tight text-lg leading-none text-[var(--accent)] disabled:opacity-40"
                      >
                        −<span className="sr-only">Remove one {line.productTitle}</span>
                      </button>
                      <span className="min-w-6 text-center text-sm tabular-nums">
                        {line.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => changeQuantity(line.id, line.quantity + 1)}
                        disabled={pending}
                        className="lx-tap-tight text-lg leading-none text-[var(--accent)] disabled:opacity-40"
                      >
                        +<span className="sr-only">Add one {line.productTitle}</span>
                      </button>
                    </div>

                    {line.stockProblem ? (
                      <p className="mt-2 text-sm text-danger">{line.stockProblem}</p>
                    ) : null}
                  </div>

                  <p className="shrink-0 font-display text-base tabular-nums">
                    {formatPrice(line.lineTotal)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lx-safe-b shrink-0 border-t border-[var(--border-subtle)] px-5 pt-5 sm:px-6">
          <div className="mb-1.5 flex justify-between gap-4 text-sm text-[var(--text-secondary)]">
            <span>Subtotal</span>
            <span className="font-semibold tabular-nums">{formatPrice(summary.subtotal)}</span>
          </div>
          <div className="mb-4 flex justify-between gap-4 text-sm font-light text-[var(--text-muted)]">
            <span>Delivery</span>
            <span className="text-right">{summary.deliveryLabel}</span>
          </div>

          {summary.lines.length > 0 ? (
            <Link
              href="/checkout"
              onClick={() => setOpen(false)}
              className="lx-cta w-full py-4 text-sm"
            >
              Checkout · {formatPrice(summary.subtotal)}
            </Link>
          ) : (
            <Link
              href="/shop"
              onClick={() => setOpen(false)}
              className="lx-cta w-full py-4 text-sm"
            >
              Start shopping
            </Link>
          )}

          <Link
            href="/cart"
            onClick={() => setOpen(false)}
            className="mt-3 block py-2 text-center text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            View full bag
          </Link>
        </div>
      </div>
    </div>
  );
}
