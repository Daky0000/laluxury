"use client";

import { useMemo, useState } from "react";
import type { ProductTileData } from "@/lib/product-view";
import { ProductTile } from "../product-tile";

/**
 * A product section rendered as a grid with room tabs above it.
 *
 * Filtering happens in the browser over the products the page already sent, so
 * switching tabs is instant and never costs a round trip. The heading and the
 * tabs both come from the section, so a store can run two of these — one for
 * bestsellers, one for a sale — with different rooms above each.
 */
export function EditGrid({
  eyebrow,
  title,
  products,
  tabs,
}: {
  eyebrow: string;
  title: string;
  products: ProductTileData[];
  tabs: { label: string; slug: string }[];
}) {
  const [active, setActive] = useState("all");

  const shown = useMemo(
    () => (active === "all" ? products : products.filter((p) => p.categorySlug === active)),
    [active, products],
  );

  return (
    <>
      <div className="mb-6 border-b border-[var(--border-subtle)] pb-5 sm:mb-8 sm:pb-6 md:flex md:flex-wrap md:items-end md:justify-between md:gap-6">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="lx-eyebrow tracking-[0.2em] sm:tracking-[0.32em]">{eyebrow}</p>
          ) : null}
          {title ? (
            <h2 className="mt-2.5 text-[clamp(1.875rem,6vw,2.875rem)] leading-tight">{title}</h2>
          ) : null}
        </div>

        {/* Below `md` the rooms scroll sideways rather than wrapping. Eight
            rooms at the type floor wrap into four lines of tabs, which pushes
            the products they are meant to filter clean off the screen. */}
        {tabs.length > 0 ? (
          <div
            role="tablist"
            aria-label="Rooms"
            className="lx-scroll-x lx-bleed -mb-1 mt-5 flex gap-5 md:mt-0 md:flex-wrap md:gap-6 md:overflow-visible"
          >
            {[{ label: "All", slug: "all" }, ...tabs].map((tab) => (
              <button
                key={tab.slug}
                type="button"
                role="tab"
                onClick={() => setActive(tab.slug)}
                aria-selected={active === tab.slug}
                className={`shrink-0 border-b pb-1 text-xs uppercase tracking-[0.12em] transition-colors ${
                  active === tab.slug
                    ? "border-[var(--accent)] text-[var(--text-primary)]"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 sm:gap-y-12 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((product) => (
          <ProductTile key={product.id} product={product} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm font-light text-[var(--text-muted)]">
          Nothing in this room yet.
        </p>
      ) : null}
    </>
  );
}
