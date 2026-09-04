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
    <li className="flex gap-5 border-b border-[var(--border-subtle)] py-5.5">
      <Link
        href={`/product/${line.slug}`}
        className="h-28 w-24 shrink-0 overflow-hidden bg-[var(--surface-media)]"
      >
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt="" className="h-full w-full object-cover" />
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col">
        <div className="flex justify-between gap-4">
          <div>
            <Link href={`/product/${line.slug}`} className="text-[15.5px] hover:underline">
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
            className="h-fit text-ink-400 transition-colors hover:text-danger disabled:opacity-40"
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

        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="inline-flex items-center gap-4 border border-[var(--border-subtle)] px-3.5 py-1.5">
            <button
              type="button"
              onClick={() => setQuantity(line.quantity - 1)}
              disabled={pending}
              className="text-base leading-none text-[var(--accent)] disabled:opacity-30"
              aria-label={`Decrease quantity of ${line.productTitle}`}
            >
              &minus;
            </button>
            <span className="min-w-3.5 text-center text-sm tabular-nums">
              {pending ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.quantity + 1)}
              disabled={pending || atMax}
              className="text-base leading-none text-[var(--accent)] disabled:opacity-30"
              aria-label={`Increase quantity of ${line.productTitle}`}
            >
              +
            </button>
          </div>

          <span className="text-[19px] tabular-nums">
            {formatPrice(line.lineTotal)}
          </span>
        </div>
      </div>
    </li>
  );
}

/** The inline code field at the top of the order summary. */
export function DiscountForm({ appliedCode }: { appliedCode: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function apply(formData: FormData) {
    const code = String(formData.get("code") ?? "");
    setMessage(null);
    startTransition(async () => {
      const result = await applyDiscountAction(code);
      setMessage({
        ok: result.ok,
        text: result.message ?? (result.ok ? "Applied." : "Invalid code."),
      });
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
      <div className="flex items-center justify-between border border-sage-600/40 bg-sage-100 px-3.5 py-3">
        <p className="text-sm text-sage-700">
          <span className="font-medium">{appliedCode}</span> applied
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="text-sm text-[var(--text-secondary)] underline-offset-2 hover:underline"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <form action={apply} className="flex">
        <label htmlFor="code" className="sr-only">
          Discount code
        </label>
        <input
          id="code"
          name="code"
          placeholder="Discount code"
          autoComplete="off"
          className="min-w-0 flex-1 border border-[var(--border-strong)] bg-white px-3.5 py-3 text-sm uppercase outline-none placeholder:normal-case placeholder:text-ink-400 focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 bg-[var(--text-primary)] px-4.5 text-sm uppercase tracking-[0.1em] text-[var(--surface)] disabled:opacity-50"
        >
          {pending ? "…" : "Apply"}
        </button>
      </form>
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
