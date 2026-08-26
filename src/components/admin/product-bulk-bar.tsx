"use client";

import { useState, useTransition, type ReactNode } from "react";
import { bulkProductAction } from "@/app/actions/admin/products";

type Operation = "publish" | "draft" | "archive" | "feature" | "unfeature";

const OPERATIONS: { value: Operation; label: string }[] = [
  { value: "publish", label: "Publish" },
  { value: "draft", label: "Move to draft" },
  { value: "archive", label: "Archive" },
  { value: "feature", label: "Feature" },
  { value: "unfeature", label: "Unfeature" },
];

/**
 * Wraps the product table in a form so the row checkboxes drive a bulk action.
 * The bar only appears once something is selected, so it never competes with
 * the table for attention.
 */
export function ProductBulkBar({
  children,
  canWrite,
}: {
  children: ReactNode;
  canWrite: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [operation, setOperation] = useState<Operation>("publish");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function sync(form: HTMLFormElement) {
    const ids = new FormData(form).getAll("productIds").map(String);
    setSelected(ids);
  }

  function apply() {
    setMessage(null);
    startTransition(async () => {
      const result = await bulkProductAction(selected, operation);
      setMessage({ ok: result.ok, text: result.message ?? "" });
      if (result.ok) setSelected([]);
    });
  }

  if (!canWrite) return <>{children}</>;

  return (
    <div className="flex flex-col gap-3">
      <form onChange={(event) => sync(event.currentTarget)}>{children}</form>

      {selected.length > 0 ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 shadow-lg">
          <span className="text-sm">
            {selected.length} selected
          </span>

          <label htmlFor="bulkOperation" className="sr-only">
            Bulk action
          </label>
          <select
            id="bulkOperation"
            value={operation}
            onChange={(event) => setOperation(event.target.value as Operation)}
            className="lx-field w-auto py-1.5 text-sm"
          >
            {OPERATIONS.map((op) => (
              <option key={op.value} value={op.value}>
                {op.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-1.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {pending ? "Applying…" : "Apply"}
          </button>

          <button
            type="button"
            onClick={() => {
              setSelected([]);
              document
                .querySelectorAll<HTMLInputElement>('input[name="productIds"]')
                .forEach((input) => {
                  input.checked = false;
                });
            }}
            className="text-sm text-[var(--text-secondary)] underline-offset-4 hover:underline"
          >
            Clear
          </button>
        </div>
      ) : null}

      {message ? (
        <p
          role={message.ok ? "status" : "alert"}
          className={`text-sm ${message.ok ? "text-success" : "text-danger"}`}
        >
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
