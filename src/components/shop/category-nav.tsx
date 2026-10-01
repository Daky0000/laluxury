"use client";

import Link from "next/link";

export type NavCategory = {
  name: string;
  slug: string;
};

export function CategoryNav({
  categories,
  hiddenItems = [],
  hidden = false,
}: {
  categories: NavCategory[];
  hiddenItems?: string[];
  hidden?: boolean;
}) {
  if (hidden) return null;
  const hiddenSet = new Set(hiddenItems);

  return (
    <nav
      aria-label="Categories"
      className="hidden items-center gap-5 text-xs tracking-[0.1em] lg:flex"
    >
      {!hiddenSet.has("shop") ? (
        <Link
          href="/shop"
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Shop All
        </Link>
      ) : null}
      {!hiddenSet.has("sale") ? (
        <Link
          href="/shop?onSale=1"
          className="font-medium text-[var(--accent)] transition-colors hover:text-[var(--accent-hover)]"
        >
          Sale
        </Link>
      ) : null}
      {categories.map((category) => {
        const isPreorder = category.slug === "pre-order";
        if (isPreorder && hiddenSet.has("pre-order")) return null;
        return (
          <Link
            key={category.slug}
            href={isPreorder ? "/pre-order" : `/shop?category=${category.slug}`}
            className={
              isPreorder
                ? "inline-flex items-center gap-1.5 border border-amber-800/30 bg-amber-950/10 px-2.5 py-1 font-medium text-[#8C6528] transition-colors hover:bg-amber-950/20"
                : "text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
            }
          >
            {isPreorder ? (
              <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" aria-hidden />
            ) : null}
            {category.name}
          </Link>
        );
      })}
      {!hiddenSet.has("pre-order") && !categories.some((c) => c.slug === "pre-order") ? (
        <Link
          href="/pre-order"
          className="inline-flex items-center gap-1.5 border border-amber-800/30 bg-amber-950/10 px-2.5 py-1 font-medium text-[#8C6528] transition-colors hover:bg-amber-950/20"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-[#D4AF37]" aria-hidden />
          Pre-Order
        </Link>
      ) : null}
      {!hiddenSet.has("lookbook") ? (
        <Link
          href="/lookbook"
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Lookbook
        </Link>
      ) : null}
      {!hiddenSet.has("trade") ? (
        <Link
          href="/trade"
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Trade
        </Link>
      ) : null}
      {!hiddenSet.has("track") ? (
        <Link
          href="/orders/track"
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Track Order
        </Link>
      ) : null}
    </nav>
  );
}

export function FrontendNavToggle() {
  return null;
}
