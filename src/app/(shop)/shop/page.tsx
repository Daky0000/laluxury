import type { Metadata } from "next";
import Link from "next/link";
import { catalogFacets, searchProducts, PRODUCT_SORTS, type ProductSort } from "@/lib/catalog";
import { ProductCard } from "@/components/shop/product-card";
import { FilterRail, ActiveFilters, OPTION_PREFIX } from "@/components/shop/filter-rail";
import { EmptyState, LinkButton } from "@/components/ui";
import { buildQuery } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Shop",
  description: "Browse handmade lighting, textiles, tableware and furniture.",
};

/** searchParams values arrive as string | string[]; normalise to an array. */
function toArray(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toSingle(value: string | string[] | undefined): string | undefined {
  const [first] = toArray(value);
  return first;
}

export default async function ShopPage({ searchParams }: PageProps<"/shop">) {
  const params = await searchParams;

  // Option facets travel as o_Colour=Ivory so any number of them can coexist.
  const options: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(OPTION_PREFIX)) {
      options[key.slice(OPTION_PREFIX.length)] = toArray(value);
    }
  }

  const q = toSingle(params.q);
  const categorySlugs = toArray(params.category);
  const collectionSlug = toSingle(params.collection);
  const tags = toArray(params.tag);
  const sort = (toSingle(params.sort) ?? "featured") as ProductSort;
  const page = Number(toSingle(params.page) ?? 1) || 1;
  const inStockOnly = toSingle(params.inStock) === "1";

  const minRaw = Number(toSingle(params.min));
  const maxRaw = Number(toSingle(params.max));
  const minPrice = Number.isFinite(minRaw) && minRaw > 0 ? minRaw * 100 : undefined;
  const maxPrice = Number.isFinite(maxRaw) && maxRaw > 0 ? maxRaw * 100 : undefined;

  const [results, facets] = await Promise.all([
    searchProducts({
      q,
      categorySlugs,
      collectionSlug,
      tags,
      options,
      sort,
      page,
      minPrice,
      maxPrice,
      inStockOnly,
      perPage: 12,
    }),
    catalogFacets(),
  ]);

  // Preserved across sort changes and pagination.
  const carried = {
    q,
    category: categorySlugs,
    collection: collectionSlug,
    tag: tags,
    min: toSingle(params.min),
    max: toSingle(params.max),
    inStock: inStockOnly ? "1" : undefined,
    ...Object.fromEntries(
      Object.entries(options).map(([name, values]) => [`${OPTION_PREFIX}${name}`, values]),
    ),
  };

  return (
    <div className="lx-container py-10">
      <header className="mb-8">
        <h1 className="text-3xl md:text-4xl">
          {q ? `Results for “${q}”` : collectionSlug ? "Collection" : "All pieces"}
        </h1>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          {results.total} {results.total === 1 ? "piece" : "pieces"}
        </p>
      </header>

      <div className="grid gap-10 lg:grid-cols-[16rem_1fr]">
        <FilterRail
          facets={facets}
          selected={{
            categorySlugs,
            tags,
            options,
            inStockOnly,
            min: toSingle(params.min),
            max: toSingle(params.max),
          }}
          carried={carried}
        />

        <div>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <ActiveFilters
              selected={{ categorySlugs, tags, options, inStockOnly, q }}
              facets={facets}
              carried={carried}
            />

            <form method="get" className="flex items-center gap-2">
              {/* Carry the current filters through the sort change. */}
              {Object.entries(carried).flatMap(([key, value]) =>
                (Array.isArray(value) ? value : value ? [value] : []).map((v, i) => (
                  <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
                )),
              )}
              <label htmlFor="sort" className="lx-eyebrow">
                Sort
              </label>
              <select
                id="sort"
                name="sort"
                defaultValue={sort}
                className="lx-field w-auto py-1.5 text-sm"
              >
                {Object.entries(PRODUCT_SORTS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <noscript>
                <button type="submit" className="text-xs underline">
                  Apply
                </button>
              </noscript>
            </form>
          </div>

          {results.items.length === 0 ? (
            <EmptyState
              title="Nothing matched those filters"
              description="Try removing a filter or widening the price range."
              action={
                <LinkButton href="/shop" variant="secondary" size="sm">
                  Clear all filters
                </LinkButton>
              }
            />
          ) : (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3">
              {results.items.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          )}

          {results.pageCount > 1 ? (
            <nav
              aria-label="Pagination"
              className="mt-14 flex items-center justify-center gap-2"
            >
              {results.hasPrevious ? (
                <Link
                  href={`/shop${buildQuery({ ...carried, sort, page: page - 1 })}`}
                  className="rounded-[--radius-card] border border-[var(--border-subtle)] px-3 py-2 text-sm hover:bg-[var(--surface-sunken)]"
                >
                  Previous
                </Link>
              ) : null}

              <span className="px-3 text-sm text-[var(--text-secondary)] tabular-nums">
                Page {results.page} of {results.pageCount}
              </span>

              {results.hasNext ? (
                <Link
                  href={`/shop${buildQuery({ ...carried, sort, page: page + 1 })}`}
                  className="rounded-[--radius-card] border border-[var(--border-subtle)] px-3 py-2 text-sm hover:bg-[var(--surface-sunken)]"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </div>
    </div>
  );
}
