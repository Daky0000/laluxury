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
      <div className="mb-8 flex flex-wrap items-end justify-between gap-6 border-b border-[var(--border-subtle)] pb-6">
        <div>
          {eyebrow ? <p className="lx-eyebrow">{eyebrow}</p> : null}
          {title ? <h2 className="mt-2.5 text-4xl md:text-[2.875rem]">{title}</h2> : null}
        </div>

        {tabs.length > 0 ? (
          <div className="flex flex-wrap gap-6">
            {[{ label: "All", slug: "all" }, ...tabs].map((tab) => (
              <button
                key={tab.slug}
                type="button"
                onClick={() => setActive(tab.slug)}
                aria-pressed={active === tab.slug}
                className={`border-b pb-1 text-sm uppercase tracking-[0.1em] transition-colors ${
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
