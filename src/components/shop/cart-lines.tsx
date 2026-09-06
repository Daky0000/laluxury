"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { X, Loader2 } from "lucide-react";
import { formatPrice } from "@/lib/money";
import {
  applyDiscountAction,
  removeCartLineAction,
  removeDiscountAction,
  updateCartLineAction,
} from "@/app/actions/cart";
import type { CartLineView } from "@/lib/cart";
import { Thumb } from "./photo";

/**
 * The bag rows from the cart & checkout artboard: a tall thumbnail, the piece
 * and the variant it is, a quantity stepper on the baseline and the line total
 * on the right, with the remove control tucked up beside the name.
 */
export function CartLines({ lines }: { lines: CartLineView[] }) {
  return (
    <ul className="border-t border-[var(--border-subtle)]">
      {lines.map((line) => (
        <CartLine key={line.id} line={line} />
      ))}
    </ul>
  );
}

function CartLine({ line }: { line: CartLineView }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setQuantity(quantity: number) {
    setError(null);
    startTransition(async () => {
      const result = await updateCartLineAction(line.id, quantity);
      if (!result.ok) setError(result.message ?? "Could not update that.");
    });
  }

  function remove() {
    startTransition(async () => {
      await removeCartLineAction(line.id);
    });
  }

  const atMax = line.availableStock !== null && line.quantity >= line.availableStock;

  return (
    <li className="flex gap-4 border-b border-[var(--border-subtle)] py-5 sm:gap-5 sm:py-5.5">
      <Link
        href={`/product/${line.slug}`}
        className="h-24 w-20 shrink-0 overflow-hidden bg-[var(--surface-media)] sm:h-28 sm:w-24"
      >
        {line.imageUrl ? <Thumb src={line.imageUrl} width={96} height={112} /> : null}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex justify-between gap-3 sm:gap-4">
          <div className="min-w-0">
            <Link href={`/product/${line.slug}`} className="text-base hover:underline">
              {line.productTitle}
            </Link>
            {line.variantTitle !== "Default" ? (
              <p className="mt-1 text-sm uppercase tracking-[0.1em] text-[var(--text-muted)]">
                {line.variantTitle}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="lx-tap-tight -mr-2.5 -mt-2 shrink-0 self-start text-ink-400 transition-colors hover:text-danger disabled:opacity-40"
          >
            <X className="h-[17px] w-[17px]" strokeWidth={1.5} aria-hidden />
            <span className="sr-only">Remove {line.productTitle}</span>
          </button>
        </div>

        {line.stockProblem ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {line.stockProblem}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-3">
          <div className="inline-flex items-center border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setQuantity(line.quantity - 1)}
              disabled={pending}
              className="lx-tap-tight text-lg leading-none text-[var(--accent)] disabled:opacity-30"
              aria-label={`Decrease quantity of ${line.productTitle}`}
            >
              &minus;
            </button>
            <span className="min-w-6 text-center text-sm tabular-nums">
              {pending ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.quantity + 1)}
              disabled={pending || atMax}
              className="lx-tap-tight text-lg leading-none text-[var(--accent)] disabled:opacity-30"
              aria-label={`Increase quantity of ${line.productTitle}`}
            >
              +
            </button>
          </div>

          <span className="whitespace-nowrap text-[19px] font-semibold tabular-nums">
            {formatPrice(line.lineTotal)}
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * The inline code field at the top of the order summary.
 *
 * Deliberately not a `<form>`. This renders in two places: on its own on the
 * cart page, and inside the checkout `<form>` — and HTML has no nested forms,
 * so the browser dropped the inner one there. The server sent markup React
 * could not match, checkout failed hydration on every render, and the code
 * field submitted the order instead of the code. A field and a button that
 * call the action directly work identically in both places.
 */
export function DiscountForm({ appliedCode }: { appliedCode: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [code, setCode] = useState("");

  function apply() {
    if (!code.trim()) return;
    setMessage(null);
    startTransition(async () => {
      const result = await applyDiscountAction(code.trim());
      setMessage({
        ok: result.ok,
        text: result.message ?? (result.ok ? "Applied." : "Invalid code."),
      });
      if (result.ok) setCode("");
    });
  }

  function clear() {
    startTransition(async () => {
      await removeDiscountAction();
      setMessage(null);
    });
  }

  if (appliedCode) {
    return (
      <div className="flex items-center justify-between gap-3 border border-sage-600/40 bg-sage-100 px-3.5 py-2">
        <p className="min-w-0 text-sm text-sage-700">
          <span className="font-medium">{appliedCode}</span> applied
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="inline-flex min-h-11 shrink-0 items-center text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex">
        <label htmlFor="code" className="sr-only">
          Discount code
        </label>
        {/* No `name`: this input sits inside the checkout form on that screen,
            and a named field there would ride along with the order. */}
        <input
          id="code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              // Otherwise Enter submits the checkout form this sits inside.
              event.preventDefault();
              apply();
            }
          }}
          placeholder="Discount code"
          autoComplete="off"
          className="min-h-12 min-w-0 flex-1 border border-[var(--border-strong)] bg-white px-3.5 py-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-ink-400 focus:border-[var(--accent)]"
        />
        <button
          type="button"
          onClick={apply}
          disabled={pending || code.trim().length === 0}
          className="min-h-12 shrink-0 bg-[var(--text-primary)] px-4 text-sm uppercase tracking-[0.1em] text-[var(--surface)] disabled:opacity-50 sm:px-4.5"
        >
          {pending ? "…" : "Apply"}
        </button>
      </div>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-2 text-sm ${message.ok ? "text-sage-600" : "text-danger"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
