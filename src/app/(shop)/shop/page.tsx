import type { Metadata } from "next";
import Link from "next/link";
import { catalogFacets, searchProducts, PRODUCT_SORTS, type ProductSort } from "@/lib/catalog";
import { toTile } from "@/lib/product-view";
import { ProductTile } from "@/components/shop/product-tile";
import { FilterRail, ActiveFilters, OPTION_PREFIX } from "@/components/shop/filter-rail";
import { buildQuery } from "@/lib/utils";

export const metadata: Metadata = {
  title: "All products",
  description:
    "Every LaLuxury piece — bedding, living, windows and student essentials — in one place.",
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
      perPage: 24,
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

  const heading = q ? `Results for “${q}”` : collectionSlug ? "The collection" : "All products";

  return (
    <>
      {/* Page head */}
      <section className="lx-container pb-2 pt-11 text-center">
        <p className="lx-eyebrow">The full collection</p>
        <h1 className="mt-3 text-[clamp(2.5rem,6vw,3.75rem)] leading-tight">{heading}</h1>
        <p className="mt-2.5 text-[15px] font-light text-[var(--text-muted)]">
          Every LaLuxury piece — bedding, living, windows and student essentials — in one place.
        </p>
      </section>

      {/* Toolbar */}
      <div className="lx-container pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-[var(--border-subtle)] py-4">
          <span className="text-[12.5px] tracking-[0.06em] text-[var(--text-secondary)]">
            {results.total} {results.total === 1 ? "piece" : "pieces"}
          </span>

          <form method="get" className="flex items-center gap-3">
            {/* Carry the current filters through the sort change. */}
            {Object.entries(carried).flatMap(([key, value]) =>
              (Array.isArray(value) ? value : value ? [value] : []).map((v, i) => (
                <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
              )),
            )}
            <label
              htmlFor="sort"
              className="text-[11.5px] uppercase tracking-[0.14em] text-[var(--text-muted)]"
            >
              Sort
            </label>
            <select
              id="sort"
              name="sort"
              defaultValue={sort}
              className="border border-[var(--border-strong)] bg-transparent px-3.5 py-2 text-[13px] outline-none"
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
      </div>

      {/* Body */}
      <section className="lx-container grid items-start gap-12 pb-16 pt-7 lg:grid-cols-[220px_1fr]">
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
          <ActiveFilters
            selected={{ categorySlugs, tags, options, inStockOnly, q }}
            facets={facets}
            carried={carried}
          />

          {results.items.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-[15px] font-light text-[var(--text-muted)]">
                No pieces match these filters.
              </p>
              <Link
                href="/shop"
                className="mt-3.5 inline-block text-[13px] text-[var(--accent)] underline underline-offset-4"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3">
              {results.items.map((product, index) => (
                <ProductTile key={product.id} product={toTile(product)} priority={index < 3} />
              ))}
            </div>
          )}

          {results.pageCount > 1 ? (
            <nav aria-label="Pagination" className="mt-14 flex items-center justify-center gap-3">
              {results.hasPrevious ? (
                <Link
                  href={`/shop${buildQuery({ ...carried, sort, page: page - 1 })}`}
                  className="border border-[var(--border-subtle)] px-4 py-2 text-xs uppercase tracking-[0.12em] transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  Previous
                </Link>
              ) : null}

              <span className="px-2 text-[12.5px] tabular-nums text-[var(--text-secondary)]">
                Page {results.page} of {results.pageCount}
              </span>

              {results.hasNext ? (
                <Link
                  href={`/shop${buildQuery({ ...carried, sort, page: page + 1 })}`}
                  className="border border-[var(--border-subtle)] px-4 py-2 text-xs uppercase tracking-[0.12em] transition-colors hover:bg-[var(--surface-sunken)]"
                >
                  Next
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
      </section>
    </>
  );
}
