"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useOverlay } from "@/lib/use-overlay";

export function MobileNav({
  categories,
  children,
}: {
  categories: { name: string; slug: string }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  useOverlay(open, () => setOpen(false));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="lx-tap-tight rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] md:hidden"
        aria-label="Open menu"
      >
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-ink-950/40 md:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          {/* Anchored right, under the button that opened it. Capped at 88% of
              the screen so the page it covers stays visible behind it, and
              `dvh` rather than `%` so the sheet does not run under the phone's
              own toolbar when that slides away. */}
          <nav
            aria-label="Main"
            className="lx-safe-b flex h-dvh w-72 max-w-[88vw] flex-col overflow-y-auto overscroll-contain bg-[var(--surface-raised)] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-8 flex items-center justify-between">
              <span className="lx-eyebrow">Shop</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="lx-tap-tight -mr-2.5 text-[var(--text-secondary)]"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            <ul className="flex flex-col">
              <li>
                <Link
                  href="/shop"
                  onClick={() => setOpen(false)}
                  className="block py-2.5 text-xl"
                >
                  All pieces
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/shop?category=${category.slug}`}
                    onClick={() => setOpen(false)}
                    className="block py-2.5 text-xl"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col border-t border-[var(--border-subtle)] pt-4 text-sm">
              <Link href="/account" onClick={() => setOpen(false)} className="py-3 text-[var(--text-secondary)]">
                Your account
              </Link>
              <Link href="/orders/track" onClick={() => setOpen(false)} className="py-3 text-[var(--text-secondary)]">
                Track an order
              </Link>
              <Link href="/contact" onClick={() => setOpen(false)} className="py-3 text-[var(--text-secondary)]">
                Contact
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
