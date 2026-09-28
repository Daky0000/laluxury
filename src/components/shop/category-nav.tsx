"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFrontendNav } from "./frontend-nav-context";

export type NavCategory = {
  name: string;
  slug: string;
};

export function CategoryNav({
  categories,
  hiddenItems = [],
}: {
  categories: NavCategory[];
  hiddenItems?: string[];
}) {
  const { navHidden, toggleNav } = useFrontendNav();
  const hidden = new Set(hiddenItems);

  if (navHidden) {
    return (
      <div className="hidden items-center lg:flex">
        <button
          type="button"
          onClick={toggleNav}
          title="Show category navigation (Alt+N)"
          aria-label="Show category navigation"
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--border-subtle)] px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)] transition-colors hover:border-[var(--color-clay-700)] hover:text-[var(--text-primary)]"
        >
          <Eye className="h-3 w-3" aria-hidden />
          <span>Show navigation</span>
        </button>
      </div>
    );
  }

  return (
    <nav
      aria-label="Categories"
      className="hidden items-center gap-5 text-xs tracking-[0.1em] lg:flex"
    >
      {!hidden.has("shop") ? (
        <Link
          href="/shop"
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Shop All
        </Link>
      ) : null}
      {categories.map((category) => {
        const isPreorder = category.slug === "pre-order";
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
      {!hidden.has("lookbook") ? (
        <Link
          href="/lookbook"
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Lookbook
        </Link>
      ) : null}
      {!hidden.has("trade") ? (
        <Link
          href="/trade"
          className="text-[var(--text-secondary)] transition-colors hover:text-[var(--accent)]"
        >
          Trade
        </Link>
      ) : null}
      {!hidden.has("track") ? (
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
  const { navHidden, toggleNav } = useFrontendNav();

  return (
    <button
      type="button"
      onClick={toggleNav}
      title={navHidden ? "Show navigation (Alt+N)" : "Hide navigation (Alt+N)"}
      aria-label={navHidden ? "Show navigation" : "Hide navigation"}
      className={cn(
        "lx-tap-tight rounded-full transition-colors",
        navHidden
          ? "text-[var(--color-clay-700)] hover:text-[var(--accent)]"
          : "text-[var(--text-secondary)] hover:text-[var(--accent)]",
      )}
    >
      {navHidden ? (
        <Eye className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden />
      ) : (
        <EyeOff className="h-[19px] w-[19px]" strokeWidth={1.5} aria-hidden />
      )}
      <span className="sr-only">
        {navHidden ? "Show navigation" : "Hide navigation"}
      </span>
    </button>
  );
}
