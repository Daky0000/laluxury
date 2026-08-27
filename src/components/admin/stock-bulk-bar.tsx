"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { bulkAdjustStockAction } from "@/app/actions/admin/catalog-ops";
import { Alert } from "@/components/ui";

/**
 * Wraps the inventory table so its row checkboxes drive one adjustment.
 *
 * Same shape as the product bulk bar: the bar only appears once something is
 * ticked, so it never competes with the table for attention. The header's
 * select-all is an ordinary checkbox carrying `data-select-all`, which keeps
 * the table itself server-rendered.
 */
export function StockBulkBar({
  children,
  canWrite,
}: {
  children: ReactNode;
  canWrite: boolean;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<"add" | "set">("set");
  const [quantity, setQuantity] = useState("");
  const [track, setTrack] = useState(true);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function sync(event: React.FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    const target = event.target as HTMLInputElement;

    if (target.dataset.selectAll !== undefined) {
      for (const box of form.querySelectorAll<HTMLInputElement>('input[name="variantIds"]')) {
        box.checked = target.checked;
      }
    }

    setMessage(null);
    setSelected(new FormData(form).getAll("variantIds").map(String));
  }

  function apply() {
    const value = Number(quantity);
    if (!Number.isFinite(value) || quantity === "") {
      setMessage({ ok: false, text: "Enter a number." });
      return;
    }

    setMessage(null);
    startTransition(async () => {
      const result = await bulkAdjustStockAction(selected, {
        mode,
        quantity: value,
        // Receiving into an untracked variant should not quietly start
        // counting it; setting an absolute figure is a stock take, and that
        // only means something once the storefront counts.
        track: mode === "set" ? track : undefined,
      });

      setMessage({ ok: result.ok, text: result.message ?? "" });
      if (result.ok) setQuantity("");
    });
  }

  if (!canWrite) return <>{children}</>;

  return (
    <div className="flex flex-col gap-3">
      <form onChange={sync}>{children}</form>

      {message ? <Alert tone={message.ok ? "success" : "danger"}>{message.text}</Alert> : null}

      {selected.length > 0 ? (
        <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-4 py-3 shadow-lg">
          <span className="text-sm">
            {selected.length} selected
          </span>

          <label htmlFor="stockMode" className="sr-only">
            Adjustment
          </label>
          <select
            id="stockMode"
            value={mode}
            onChange={(event) => setMode(event.target.value as "add" | "set")}
            className="lx-field w-36 py-2 text-sm"
          >
            <option value="set">Set stock to</option>
            <option value="add">Receive units</option>
          </select>

          <label htmlFor="stockQuantity" className="sr-only">
            Quantity
          </label>
          <input
            id="stockQuantity"
            type="number"
            min="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") apply();
            }}
            placeholder="0"
            className="lx-field w-24 py-2 text-sm"
          />

          {mode === "set" ? (
            <label className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={track}
                onChange={(event) => setTrack(event.target.checked)}
                className="accent-[var(--accent)]"
              />
              Count this stock on the storefront
            </label>
          ) : null}

          <button
            type="button"
            onClick={apply}
            disabled={pending || quantity === ""}
            className="ml-auto inline-flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Apply to {selected.length}
          </button>
        </div>
      ) : null}
    </div>
  );
}
