"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Minus, Plus, Trash2, Loader2 } from "lucide-react";
import { formatMoney } from "@/lib/money";
import {
  applyDiscountAction,
  removeCartLineAction,
  removeDiscountAction,
  updateCartLineAction,
} from "@/app/actions/cart";
import type { CartLineView } from "@/lib/cart";

export function CartLines({ lines }: { lines: CartLineView[] }) {
  return (
    <ul className="divide-y divide-[var(--border-subtle)]">
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
    <li className="flex gap-4 py-5">
      <Link href={`/product/${line.slug}`} className="lx-media h-28 w-24 shrink-0 rounded-[--radius-card]">
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt="" />
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col">
        <div className="flex justify-between gap-4">
          <div>
            <Link href={`/product/${line.slug}`} className="font-display text-lg hover:underline">
              {line.productTitle}
            </Link>
            {line.variantTitle !== "Default" ? (
              <p className="text-xs text-[var(--text-secondary)]">{line.variantTitle}</p>
            ) : null}
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{line.sku}</p>
          </div>

          <p className="shrink-0 text-sm tabular-nums">{formatMoney(line.lineTotal)}</p>
        </div>

        {line.stockProblem ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {line.stockProblem}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-xs text-danger">
            {error}
          </p>
        ) : null}

        <div className="mt-auto flex items-center justify-between pt-3">
          <div className="flex items-center rounded-[--radius-card] border border-[var(--border-subtle)]">
            <button
              type="button"
              onClick={() => setQuantity(line.quantity - 1)}
              disabled={pending}
              className="px-2.5 py-1.5 text-[var(--text-secondary)] disabled:opacity-30"
              aria-label={`Decrease quantity of ${line.productTitle}`}
            >
              <Minus className="h-3.5 w-3.5" aria-hidden />
            </button>
            <span className="w-8 text-center text-sm tabular-nums">
              {pending ? <Loader2 className="mx-auto h-3.5 w-3.5 animate-spin" /> : line.quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(line.quantity + 1)}
              disabled={pending || atMax}
              className="px-2.5 py-1.5 text-[var(--text-secondary)] disabled:opacity-30"
              aria-label={`Increase quantity of ${line.productTitle}`}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>

          <button
            type="button"
            onClick={remove}
            disabled={pending}
            className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-danger"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export function DiscountForm({ appliedCode }: { appliedCode: string | null }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function apply(formData: FormData) {
    const code = String(formData.get("code") ?? "");
    setMessage(null);
    startTransition(async () => {
      const result = await applyDiscountAction(code);
      setMessage({ ok: result.ok, text: result.message ?? (result.ok ? "Applied." : "Invalid code.") });
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
      <div className="flex items-center justify-between rounded-[--radius-card] border border-success/30 bg-success/5 px-3 py-2.5">
        <p className="text-sm text-success">
          <span className="font-medium">{appliedCode}</span> applied
        </p>
        <button
          type="button"
          onClick={clear}
          disabled={pending}
          className="text-xs text-[var(--text-secondary)] underline-offset-2 hover:underline"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <form action={apply} className="flex gap-2">
        <label htmlFor="code" className="sr-only">
          Discount code
        </label>
        <input
          id="code"
          name="code"
          placeholder="Discount code"
          autoComplete="off"
          className="lx-field flex-1 uppercase"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-[--radius-card] border border-[var(--border-subtle)] px-4 text-sm hover:bg-[var(--surface-sunken)] disabled:opacity-50"
        >
          {pending ? "..." : "Apply"}
        </button>
      </form>
      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`mt-2 text-xs ${message.ok ? "text-success" : "text-danger"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
