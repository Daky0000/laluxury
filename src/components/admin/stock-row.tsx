"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Loader2 } from "lucide-react";
import { adjustStockAction, setStockAction } from "@/app/actions/admin/catalog-ops";
import { cn } from "@/lib/utils";

/**
 * One inventory line, edited in place.
 *
 * On hand is a plain field that saves itself: type the counted figure, and
 * roughly a second after the last keystroke — or the moment focus leaves — it
 * is written and the ledger gets its entry. A stock take is walked down the
 * page, not clicked down it, and nothing is lost by tabbing to the next row.
 *
 * Receiving stays a separate box because it means something different: units
 * arriving on top of whatever is already counted.
 */

/** How long to wait after the last keystroke before writing. */
const SAVE_DELAY_MS = 900;

type Status = "idle" | "saving" | "saved" | "error";

export function StockRow({
  variantId,
  productId,
  productTitle,
  variantTitle,
  sku,
  onHand,
  reserved,
  reorderPoint,
  trackInventory,
  canWrite,
}: {
  variantId: string;
  productId: string;
  productTitle: string;
  variantTitle: string;
  sku: string;
  onHand: number;
  reserved: number;
  reorderPoint: number;
  trackInventory: boolean;
  canWrite: boolean;
}) {
  const [counted, setCounted] = useState(String(onHand));
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startSaving] = useTransition();

  // What the server last confirmed. Held twice on purpose: the state drives the
  // available figure beside it, the ref is what a debounced write compares
  // against, since that callback closes over an older render.
  const [saved, setSaved] = useState(onHand);
  const savedRef = useRef(onHand);
  const timerRef = useRef<number | null>(null);

  function remember(value: number) {
    savedRef.current = value;
    setSaved(value);
  }

  const [receiving, setReceiving] = useState("");
  const [receivePending, startReceiving] = useTransition();
  const [received, setReceived] = useState(false);

  const current = Number(counted);
  const available = (counted.trim() !== "" && Number.isFinite(current) ? current : saved) - reserved;

  function save(next: number) {
    if (!Number.isFinite(next) || next < 0) {
      setStatus("error");
      setError("Enter a number, zero or more.");
      return;
    }
    if (next === savedRef.current) {
      setStatus("idle");
      setError(null);
      return;
    }

    setStatus("saving");
    setError(null);

    startSaving(async () => {
      const result = await setStockAction(variantId, next);

      if (!result.ok) {
        setStatus("error");
        setError(result.message ?? "Could not save.");
        // Put the field back to the figure that is actually in the ledger.
        setCounted(String(savedRef.current));
        return;
      }

      remember(result.onHand ?? next);
      setCounted(String(result.onHand ?? next));
      setStatus("saved");
    });
  }

  function schedule(next: number) {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => save(next), SAVE_DELAY_MS);
  }

  /** Leaving the field or pressing Enter writes it now rather than waiting. */
  function flush() {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    if (counted.trim() === "") {
      setCounted(String(savedRef.current));
      setStatus("idle");
      return;
    }
    save(Number(counted));
  }

  // A pending write must not be dropped when the table re-renders away.
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  // The tick is an acknowledgement, not a state to sit in.
  useEffect(() => {
    if (status !== "saved") return;
    const timer = window.setTimeout(() => setStatus("idle"), 1800);
    return () => window.clearTimeout(timer);
  }, [status]);

  function receive() {
    const value = Number(receiving);
    if (!Number.isFinite(value) || value <= 0) return;

    const formData = new FormData();
    formData.set("variantId", variantId);
    formData.set("mode", "add");
    formData.set("quantity", String(value));
    formData.set("reason", "Delivery received");

    startReceiving(async () => {
      const result = await adjustStockAction(null, formData);

      if (!result.ok) {
        setError(result.message ?? "Could not update.");
        return;
      }

      // The counted field is the same number the delivery just changed.
      const total = savedRef.current + value;
      remember(total);
      setCounted(String(total));
      setReceiving("");
      setReceived(true);
      setTimeout(() => setReceived(false), 2000);
    });
  }

  return (
    <tr className="hover:bg-[var(--surface-sunken)]">
      {canWrite ? (
        <td className="px-4 py-3">
          <input
            type="checkbox"
            name="variantIds"
            value={variantId}
            className="accent-[var(--accent)]"
            aria-label={`Select ${productTitle} ${sku}`}
          />
        </td>
      ) : null}

      <td className="px-4 py-3">
        <Link href={`/admin/products/${productId}`} className="hover:underline">
          {productTitle}
        </Link>
        {variantTitle !== "Default" ? (
          <span className="block text-xs text-[var(--text-secondary)]">{variantTitle}</span>
        ) : null}
      </td>

      <td className="px-3 py-3 font-mono text-xs">{sku}</td>

      <td className="px-3 py-3">
        {canWrite ? (
          <span className="flex items-center gap-1.5">
            <label htmlFor={`onhand-${variantId}`} className="sr-only">
              Units on hand for {sku}
            </label>
            <input
              id={`onhand-${variantId}`}
              type="number"
              min="0"
              inputMode="numeric"
              value={counted}
              onChange={(event) => {
                setCounted(event.target.value);
                setStatus("idle");
                setError(null);
                if (event.target.value.trim() !== "") schedule(Number(event.target.value));
              }}
              onBlur={flush}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
                if (event.key === "Escape") {
                  setCounted(String(savedRef.current));
                  setStatus("idle");
                  setError(null);
                }
              }}
              className={cn(
                "lx-field w-20 py-1 text-sm tabular-nums",
                status === "error" && "border-danger",
              )}
            />

            <span className="w-4 shrink-0" aria-live="polite">
              {status === "saving" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" aria-hidden />
              ) : status === "saved" ? (
                <Check className="h-3.5 w-3.5 text-success" aria-hidden />
              ) : null}
              <span className="sr-only">
                {status === "saving" ? "Saving" : status === "saved" ? "Saved" : ""}
              </span>
            </span>
          </span>
        ) : (
          <span className="tabular-nums">{onHand}</span>
        )}
      </td>

      <td className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">{reserved}</td>

      <td className="px-3 py-3">
        {!trackInventory ? (
          <span className="text-[var(--text-muted)]">Untracked</span>
        ) : (
          <span
            className={cn(
              "tabular-nums",
              available <= 0 ? "text-danger" : available <= reorderPoint ? "text-warning" : "",
            )}
          >
            {available}
          </span>
        )}
      </td>

      <td className="px-3 py-3 tabular-nums text-[var(--text-secondary)]">{reorderPoint}</td>

      {canWrite ? (
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor={`receive-${variantId}`} className="sr-only">
              Units received for {sku}
            </label>
            <input
              id={`receive-${variantId}`}
              type="number"
              min="0"
              value={receiving}
              onChange={(event) => setReceiving(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  receive();
                }
              }}
              placeholder="0"
              className="lx-field w-16 py-1 text-xs"
            />

            <button
              type="button"
              onClick={receive}
              disabled={receivePending || receiving === ""}
              className="rounded-(--radius-card) border border-[var(--border-subtle)] px-2.5 py-1 text-xs disabled:opacity-40"
            >
              {receivePending ? (
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              ) : received ? (
                <Check className="h-3 w-3 text-success" aria-hidden />
              ) : (
                "Receive"
              )}
            </button>
          </div>

          {error ? (
            <p role="alert" className="mt-1 text-xs text-danger">
              {error}
            </p>
          ) : null}
        </td>
      ) : null}
    </tr>
  );
}
