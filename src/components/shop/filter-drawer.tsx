"use client";

import { useState, type ReactNode } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useOverlay } from "@/lib/use-overlay";

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

  // Holds the grid behind it still, and closes on Escape.
  useOverlay(open, () => setOpen(false));

  return (
    <div className="lg:contents">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-center gap-2.5 border border-[var(--border-strong)] bg-[var(--surface-raised)] px-5 py-3.5 text-sm uppercase tracking-[0.14em] transition-colors hover:bg-[var(--surface-sunken)] lg:hidden"
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
        role={open ? "dialog" : undefined}
        aria-modal={open ? true : undefined}
        aria-label={open ? "Filters" : undefined}
        className={cn(
          // From `lg` the sheet is undone and it becomes the ordinary left
          // column again, sticky so it stays with the grid as that scrolls.
          "lg:z-auto lg:block lg:h-auto lg:w-auto lg:max-w-none lg:overflow-visible lg:bg-transparent lg:p-0",
          "lg:sticky lg:top-28 lg:self-start",
          open
            // `h-dvh` rather than `inset-y-0`: on a phone the visual viewport
            // shrinks as the browser's own toolbar slides in, and an inset-
            // anchored sheet leaves its confirm button under it.
            ? "fixed right-0 top-0 z-50 flex h-dvh w-[86%] max-w-[340px] flex-col overscroll-contain bg-[var(--surface-raised)]"
            : "hidden",
        )}
      >
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-6 py-3 lg:hidden">
          <span className="lx-eyebrow">Filters</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="lx-tap-tight -mr-2.5 text-[var(--text-secondary)]"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        {/* The rail scrolls; the confirm button below it does not, so it is
            always within reach however long the list of filters gets. */}
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5 lg:overflow-visible lg:p-0">
          {children}
        </div>

        {/* On a phone the results are behind the sheet, so it needs a way back
            to them that does not undo the filters just chosen. */}
        <div className="lx-safe-b border-t border-[var(--border-subtle)] px-6 pt-4 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex min-h-12 w-full items-center justify-center bg-[var(--accent)] px-6 py-3.5 text-sm uppercase tracking-[0.14em] text-[var(--accent-contrast)]"
          >
            Show results
          </button>
        </div>
      </div>
    </div>
  );
}
