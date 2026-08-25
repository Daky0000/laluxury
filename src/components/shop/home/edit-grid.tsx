"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/money";
import type { HomeProduct } from "@/lib/home";
import { AddToBag } from "../add-to-bag";

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
  products: HomeProduct[];
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
          <EditCard key={product.id} product={product} />
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

function EditCard({ product }: { product: HomeProduct }) {
  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.price;

  return (
    <article className="group flex flex-col">
      <div className="relative aspect-square overflow-hidden bg-[var(--surface-media)]">
        <Link href={`/product/${product.slug}`} className="block h-full w-full">
          {product.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.imageAlt}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
          ) : (
            <span className="flex h-full items-center justify-center text-xs text-[var(--text-muted)]">
              No image yet
            </span>
          )}
        </Link>

        {product.badge ? (
          <span className="absolute left-3.5 top-3.5 border border-[var(--border-subtle)] bg-[rgba(253,250,244,0.9)] px-2.5 py-1.5 text-[9.5px] font-medium uppercase tracking-[0.16em] text-[var(--text-primary)] backdrop-blur">
            {product.badge}
          </span>
        ) : null}

        <AddToBag
          variantId={product.inStock ? product.variantId : null}
          href={`/product/${product.slug}`}
          soldOut={!product.inStock}
        />
      </div>

      <div className="flex items-start justify-between gap-2.5 pt-3.5">
        <div>
          <h3 className="font-sans text-[0.9rem] font-normal leading-snug tracking-normal">
            <Link href={`/product/${product.slug}`} className="hover:underline">
              {product.title}
            </Link>
          </h3>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
            {product.category}
          </p>
        </div>

        <div className="whitespace-nowrap text-right">
          {product.hasRange ? (
            <span className="text-[10.5px] text-[var(--text-muted)]">from </span>
          ) : null}
          <span className="font-display text-[19px] tabular-nums">
            {formatPrice(product.price)}
          </span>
          {onSale ? (
            <span className="mt-0.5 block text-[11px] text-[var(--text-muted)] line-through">
              {formatPrice(product.compareAtPrice!)}
            </span>
          ) : null}
        </div>
      </div>
    </article>
  );
}
