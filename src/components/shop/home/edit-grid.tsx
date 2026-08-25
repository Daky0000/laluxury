"use client";

import { useMemo, useState } from "react";
import type { ProductTileData } from "@/lib/product-view";
import { ProductTile } from "../product-tile";

/**
 * "The edit" — the bestseller grid with its room tabs.
 *
 * Filtering happens in the browser over the products the page already sent, so
 * switching tabs is instant and never costs a round trip.
 */
export function EditGrid({
  products,
  tabs,
}: {
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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-[var(--border-subtle)] pb-6">
        <div>
          <p className="lx-eyebrow">Most desired</p>
          <h2 className="mt-2.5 text-4xl md:text-[2.875rem]">The edit</h2>
        </div>

        <div className="flex flex-wrap gap-6">
          {[{ label: "All", slug: "all" }, ...tabs].map((tab) => (
            <button
              key={tab.slug}
              type="button"
              onClick={() => setActive(tab.slug)}
              aria-pressed={active === tab.slug}
              className={`border-b pb-1 text-xs uppercase tracking-[0.1em] transition-colors ${
                active === tab.slug
                  ? "border-[var(--accent)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-8 md:grid-cols-3 lg:grid-cols-4">
        {shown.map((product) => (
          <ProductTile key={product.id} product={product} />
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--text-muted)]">
          Nothing in this room yet.
        </p>
      ) : null}
    </>
  );
}
