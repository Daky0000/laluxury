"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";

export function MobileNav({
  categories,
  children,
}: {
  categories: { name: string; slug: string }[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] md:hidden"
        aria-label="Open menu"
      >
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-ink-950/40 md:hidden"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <nav
            aria-label="Main"
            className="h-full w-72 bg-[var(--surface-raised)] p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-8 flex items-center justify-between">
              <span className="lx-eyebrow">Shop</span>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu">
                <X className="h-5 w-5 text-[var(--text-secondary)]" aria-hidden />
              </button>
            </div>

            <ul className="flex flex-col gap-1">
              <li>
                <Link
                  href="/shop"
                  onClick={() => setOpen(false)}
                  className="block py-2 text-xl"
                >
                  All pieces
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.slug}>
                  <Link
                    href={`/shop?category=${category.slug}`}
                    onClick={() => setOpen(false)}
                    className="block py-2 text-xl"
                  >
                    {category.name}
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-8 flex flex-col gap-1 border-t border-[var(--border-subtle)] pt-6 text-sm">
              <Link href="/account" onClick={() => setOpen(false)} className="py-1.5 text-[var(--text-secondary)]">
                Your account
              </Link>
              <Link href="/orders/track" onClick={() => setOpen(false)} className="py-1.5 text-[var(--text-secondary)]">
                Track an order
              </Link>
              <Link href="/contact" onClick={() => setOpen(false)} className="py-1.5 text-[var(--text-secondary)]">
                Contact
              </Link>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}
