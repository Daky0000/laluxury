"use client";

import { useEffect, useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The shell the filter rail sits in.
 *
 * On a desktop the rail is simply the left column of the catalog and this adds
 * nothing to it. On a phone the whole rail used to push the grid a full screen
 * down, so the first thing a shopper saw on /shop was a wall of checkboxes
 * rather than a product. Here it collapses behind a button and opens as a
 * sheet over the page.
 *
 * The rail itself is still server-rendered links, so filtering works exactly as
 * it did; only opening the sheet needs JavaScript, and only on a phone.
 */
export function FilterDrawer({
  children,
  activeCount,
}: {
  children: ReactNode;
  /** Shown on the button so a filtered grid never looks unfiltered. */
  activeCount: number;
}) {
  const [open, setOpen] = useState(false);

  // While the sheet is over the page, the page behind it should not scroll.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2.5 border border-[var(--border-strong)] bg-[var(--surface-raised)] px-5 py-3.5 text-sm uppercase tracking-[0.14em] transition-colors hover:bg-[var(--surface-sunken)] lg:hidden"
      >
        <SlidersHorizontal className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        Filters
        {activeCount > 0 ? (
          <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--accent)] px-1.5 text-[13px] tabular-nums text-[var(--accent-contrast)]">
            {activeCount}
          </span>
        ) : null}
      </button>

      {/* One instance of the rail, restyled rather than duplicated: a sheet
          when it is open on a phone, the ordinary column from `lg` up. */}
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-ink-950/40 lg:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        />
      ) : null}

      <div
        className={cn(
          // From `lg` the sheet is undone and it becomes the ordinary left
          // column again, sticky so it stays with the grid as that scrolls.
          "lg:z-auto lg:block lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0",
          "lg:sticky lg:top-28 lg:self-start",
          open
            ? "fixed inset-y-0 right-0 z-50 w-[86%] max-w-[340px] overflow-y-auto bg-[var(--surface-raised)] px-6 pb-10 pt-5"
            : "hidden",
        )}
      >
        <div className="mb-6 flex items-center justify-between lg:hidden">
          <span className="lx-eyebrow">Filters</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="grid h-9 w-9 place-items-center text-[var(--text-secondary)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {children}

        {/* On a phone the results are behind the sheet, so it needs a way back
            to them that does not undo the filters just chosen. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="mt-8 flex w-full items-center justify-center bg-[var(--accent)] px-6 py-3.5 text-sm uppercase tracking-[0.14em] text-[var(--accent-contrast)] lg:hidden"
        >
          Show results
        </button>
      </div>
    </div>
  );
}
