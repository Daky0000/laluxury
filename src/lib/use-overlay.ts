"use client";

import { useEffect, useRef } from "react";

/**
 * The shared behaviour every sheet, drawer and dialog in the shop needs: while
 * one is over the page, the page behind it holds still, and Escape closes it.
 *
 * Locking the scroll is counted rather than set, because more than one overlay
 * can be open at a time — adding to the bag from inside the filter sheet opens
 * the bag drawer on top of it. Each overlay used to save and restore
 * `body.style.overflow` itself, so whichever closed first handed the page back
 * its scroll while the other was still covering it.
 *
 * The scrollbar's width is given back as padding on the way in. Without it,
 * hiding the bar widens the page by ~15px on a desktop and every fixed element
 * jumps sideways as the drawer opens.
 */

let locks = 0;
let restore: { overflow: string; paddingRight: string } | null = null;

function lock(): void {
  if (typeof document === "undefined") return;

  if (locks === 0) {
    const { body } = document;
    const gap = window.innerWidth - document.documentElement.clientWidth;

    restore = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
  }

  locks += 1;
}

function unlock(): void {
  if (typeof document === "undefined") return;

  locks = Math.max(0, locks - 1);

  if (locks === 0 && restore) {
    document.body.style.overflow = restore.overflow;
    document.body.style.paddingRight = restore.paddingRight;
    restore = null;
  }
}

/**
 * @param open   Whether the overlay is currently showing.
 * @param close  Called when Escape is pressed. Omit for an overlay that has no
 *               dismiss of its own.
 */
export function useOverlay(open: boolean, close?: () => void): void {
  // Held in a ref rather than a dependency: `close` is a fresh closure on every
  // render, and re-running the effect would release the scroll lock and take it
  // again mid-scroll. The key handler reads whatever is current when it fires.
  const onClose = useRef(close);

  useEffect(() => {
    onClose.current = close;
  });

  useEffect(() => {
    if (!open) return;

    lock();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose.current?.();
    }

    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      unlock();
    };
  }, [open]);
}
