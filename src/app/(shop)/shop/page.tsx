import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { catalogFacets, searchProducts, PRODUCT_SORTS, type ProductSort } from "@/lib/catalog";
import { toTile } from "@/lib/product-view";
import { ProductTile } from "@/components/shop/product-tile";
import { SortSelect } from "@/components/shop/sort-select";
import { FilterRail, ActiveFilters, OPTION_PREFIX } from "@/components/shop/filter-rail";
import { buildQuery } from "@/lib/utils";

export const metadata: Metadata = {
  title: "All products",
  description:
    "Every LaLuxury piece — bedding, living, windows and student essentials — in one place.",
};

/** The grid opens on four rows of three and grows a row at a time. */
const FIRST_PAGE = 12;
const LOAD_MORE_STEP = 9;
/** Matches the ceiling `searchProducts` will honour. */
const MAX_SHOWN = 240;

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
  const inStockOnly = toSingle(params.inStock) === "1";
  const onSaleOnly = toSingle(params.onSale) === "1";

  const showRaw = Number(toSingle(params.show));
  const show = Math.min(
    MAX_SHOWN,
    Number.isFinite(showRaw) && showRaw > 0 ? Math.floor(showRaw) : FIRST_PAGE,
  );

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
      minPrice,
      maxPrice,
      inStockOnly,
      onSaleOnly,
      perPage: show,
    }),
    catalogFacets(),
  ]);

  // Preserved across sort changes, filter toggles and load-more.
  const carried = {
    q,
    category: categorySlugs,
    collection: collectionSlug,
    tag: tags,
    min: toSingle(params.min),
    max: toSingle(params.max),
    inStock: inStockOnly ? "1" : undefined,
    onSale: onSaleOnly ? "1" : undefined,
    ...Object.fromEntries(
      Object.entries(options).map(([name, values]) => [`${OPTION_PREFIX}${name}`, values]),
    ),
  };

  const heading = q ? `Results for “${q}”` : collectionSlug ? "The collection" : "All products";
  const remaining = results.total - results.items.length;

  return (
    <>
      {/* Page head */}
      <section className="lx-container pb-2 pt-11 text-center">
        <p className="lx-eyebrow">Every piece</p>
        <h1 className="mt-3 text-[clamp(2.5rem,6vw,3.625rem)] leading-tight">{heading}</h1>
        <p className="mt-2.5 text-base font-light text-[var(--text-muted)]">
          Bedding, living, windows and student essentials — filter your way to it.
        </p>
      </section>

      {/* Toolbar: search, tally, sort */}
      <div className="lx-container pt-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-y border-[var(--border-subtle)] py-3.5">
          <form
            method="get"
            action="/shop"
            className="flex w-full items-center gap-2.5 border border-[var(--border-strong)] bg-[var(--surface-raised)] px-3.5 py-2 sm:w-[300px]"
          >
            {/* Searching starts the results over, so `show` is deliberately dropped. */}
            {Object.entries(carried).flatMap(([key, value]) =>
              key === "q"
                ? []
                : (Array.isArray(value) ? value : value ? [value] : []).map((v, i) => (
                    <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
                  )),
            )}
            <label htmlFor="q" className="sr-only">
              Search all products
            </label>
            <Search className="h-[15px] w-[15px] shrink-0 text-[var(--text-muted)]" aria-hidden />
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search all products…"
              className="w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-ink-400"
            />
            <button type="submit" className="sr-only">
              Search
            </button>
          </form>

          <span className="text-sm tracking-[0.06em] text-[var(--text-secondary)]">
            {results.total} of {facets.productTotal} pieces
          </span>

          <form method="get" action="/shop" className="flex items-center gap-3">
            {/* Carry the current filters through the sort change. */}
            {Object.entries(carried).flatMap(([key, value]) =>
              (Array.isArray(value) ? value : value ? [value] : []).map((v, i) => (
                <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
              )),
            )}
            <SortSelect
              value={sort}
              options={Object.entries(PRODUCT_SORTS).map(([value, label]) => ({ value, label }))}
            />
          </form>
        </div>
      </div>

      {/* Active filters */}
      <div className="lx-container pt-4 empty:pt-0">
        <ActiveFilters
          selected={{ categorySlugs, tags, options, inStockOnly, onSaleOnly, min: toSingle(params.min), max: toSingle(params.max), q }}
          facets={facets}
          carried={carried}
        />
      </div>

      {/* Body */}
      <section className="lx-container grid items-start gap-x-13 gap-y-10 pb-16 pt-7 lg:grid-cols-[238px_1fr]">
        <FilterRail
          facets={facets}
          selected={{
            categorySlugs,
            tags,
            options,
            inStockOnly,
            onSaleOnly,
            min: toSingle(params.min),
            max: toSingle(params.max),
          }}
          carried={carried}
        />

        <div>
          {results.items.length === 0 ? (
            <div className="py-24 text-center">
              <p className="text-base font-light text-[var(--text-muted)]">
                Nothing matches these filters.
              </p>
              <Link
                href="/shop"
                className="mt-3.5 inline-block text-sm text-[var(--accent)] underline underline-offset-4"
              >
                Clear filters
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-x-6 gap-y-[34px] md:grid-cols-3">
                {results.items.map((product, index) => (
                  <ProductTile key={product.id} product={toTile(product)} priority={index < 3} />
                ))}
              </div>

              {remaining > 0 ? (
                <div className="mt-11 flex justify-center">
                  <Link
                    href={`/shop${buildQuery({
                      ...carried,
                      sort,
                      show: Math.min(MAX_SHOWN, show + LOAD_MORE_STEP),
                    })}`}
                    scroll={false}
                    className="border border-[var(--border-strong)] px-10 py-4 text-sm uppercase tracking-[0.14em] transition-colors hover:bg-[var(--surface-sunken)]"
                  >
                    Load more ({remaining})
                  </Link>
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}
