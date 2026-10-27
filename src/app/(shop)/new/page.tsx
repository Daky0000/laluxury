import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { searchProducts } from "@/lib/catalog";
import { toTile } from "@/lib/product-view";
import { ProductTile } from "@/components/shop/product-tile";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "New In Stock & Latest Arrivals | Noble Enclave",
  description:
    "Explore newly added luxury pieces and new varieties in stock at Noble Enclave. Fresh arrivals across bedding, living, carpets, and windows.",
};

export default async function NewProductsPage() {
  const result = await searchProducts({
    newOnly: true,
    sort: "newest",
    perPage: 48,
  });

  const tiles = result.items.map(toTile);

  return (
    <div className="lx-container py-10 sm:py-16">
      {/* Editorial Header */}
      <section className="relative overflow-hidden border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-6 py-12 text-center sm:px-12 sm:py-16">
        <div className="mx-auto max-w-2xl">
          <p className="inline-flex items-center gap-1.5 border border-emerald-700/30 bg-emerald-950/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-200 backdrop-blur">
            <Sparkles className="h-3 w-3 text-emerald-300" aria-hidden />
            New Arrivals
          </p>
          <h1 className="mt-4 text-[clamp(2.25rem,6vw,3.5rem)] leading-tight font-display tracking-tight text-[var(--text-primary)]">
            Fresh in Stock
          </h1>
          <p className="mt-3 text-sm sm:text-base font-light leading-relaxed text-[var(--text-secondary)]">
            New pieces and newly released varieties added to our catalogue in the last 7 days.
            Hand-selected, authenticated, and ready for immediate delivery.
          </p>
        </div>
      </section>

      {/* Product Grid or Clean Empty State */}
      <section className="mt-10 sm:mt-12">
        {tiles.length === 0 ? (
          <div className="border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-12 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-[var(--accent)]" aria-hidden />
            <h2 className="mt-3 font-display text-2xl text-[var(--text-primary)]">
              No new arrivals this week
            </h2>
            <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-md mx-auto">
              All pieces in our catalogue are currently established stock. Browse our complete collection of luxury bedding, drapery, carpets, and living essentials.
            </p>
            <div className="mt-6">
              <Link
                href="/shop"
                className="inline-flex min-h-11 items-center justify-center gap-2 bg-[var(--text-primary)] px-6 py-2.5 text-xs uppercase tracking-[0.16em] text-[var(--surface-raised)] transition-opacity hover:opacity-90"
              >
                Browse All Products
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <div className="mb-6 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
              <span>Showing {tiles.length} new {tiles.length === 1 ? "piece" : "pieces"}</span>
              <Link href="/shop" className="hover:text-[var(--text-primary)] underline underline-offset-4">
                View Full Catalog
              </Link>
            </div>
            <div className="grid grid-cols-1 min-[340px]:grid-cols-2 gap-x-4 gap-y-10 sm:gap-x-5 sm:gap-y-12 md:grid-cols-3 lg:grid-cols-4">
              {tiles.map((product, idx) => (
                <ProductTile key={product.id} product={product} priority={idx < 4} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
