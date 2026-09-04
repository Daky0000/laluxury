"use client";

import { ShoppingBag } from "lucide-react";
import { openBag } from "./bag-events";

/** Opens the mini-bag drawer; the count is rendered on the server. */
export function BagButton({ count }: { count: number }) {
  return (
    <button
      type="button"
      onClick={openBag}
      className="flex items-center gap-2 text-sm tracking-[0.06em] text-[var(--text-primary)] transition-colors hover:text-[var(--accent)]"
    >
      <ShoppingBag className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden />
      <span className="min-w-2 tabular-nums">{count}</span>
      <span className="sr-only">
        Open bag{count > 0 ? `, ${count} item${count === 1 ? "" : "s"}` : ", empty"}
      </span>
    </button>
  );
}
