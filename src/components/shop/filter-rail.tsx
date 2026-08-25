import Link from "next/link";
import { X } from "lucide-react";
import { buildQuery, cn } from "@/lib/utils";
import { toMajorUnits } from "@/lib/money";
import type { catalogFacets } from "@/lib/catalog";

/**
 * Filters are plain links over searchParams rather than client state.
 * That keeps every filtered view shareable, indexable and functional without
 * JavaScript, which matters on the patchy mobile connections a lot of Ghanaian
 * shoppers browse on.
 *
 * Layout follows the all-products artboard: category counts, price bands,
 * colour swatches, then a clear-all.
 */

export const OPTION_PREFIX = "o_";

type Facets = Awaited<ReturnType<typeof catalogFacets>>;

type Selected = {
  categorySlugs: string[];
  tags: string[];
  options: Record<string, string[]>;
  inStockOnly: boolean;
  min?: string;
  max?: string;
  q?: string;
};

type Carried = Record<string, string | string[] | undefined>;

/** Price bands from the artboard, in major units. `max: null` means open-ended. */
export const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "All prices" },
  { label: "Under ₵100", max: 99 },
  { label: "₵100 – ₵250", min: 100, max: 250 },
  { label: "Over ₵250", min: 251 },
];

/** Toggles one value in a multi-select param, preserving everything else. */
function toggleQuery(carried: Carried, key: string, value: string): string {
  const current = carried[key];
  const values = Array.isArray(current) ? [...current] : current ? [current] : [];
  const index = values.indexOf(value);

  if (index >= 0) values.splice(index, 1);
  else values.push(value);

  // Changing a filter always returns to page 1.
  return `/shop${buildQuery({ ...carried, [key]: values, page: undefined })}`;
}

function removeQuery(carried: Carried, key: string, value?: string): string {
  if (value === undefined) {
    return `/shop${buildQuery({ ...carried, [key]: undefined, page: undefined })}`;
  }
  return toggleQuery(carried, key, value);
}

const railHeading = "mb-3.5 text-[11px] uppercase tracking-[0.18em] text-[var(--text-primary)]";

const railRow = (active: boolean) =>
  cn(
    "flex w-full items-center justify-between py-2 text-left text-[13.5px] transition-colors",
    active
      ? "font-medium text-[var(--text-primary)]"
      : "font-light text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
  );

export function FilterRail({
  facets,
  selected,
  carried,
}: {
  facets: Facets;
  selected: Selected;
  carried: Carried;
}) {
  const topLevel = facets.categories.filter((c) => c.parentId === null);

  const activeBand = PRICE_BANDS.find((band) => {
    const min = band.min === undefined ? undefined : String(band.min);
    const max = band.max === undefined ? undefined : String(band.max);
    return (selected.min || undefined) === min && (selected.max || undefined) === max;
  });

  return (
    <aside aria-label="Filters" className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
      {/* Category */}
      {topLevel.length > 0 ? (
        <section>
          <h2 className={railHeading}>Category</h2>
          <ul>
            <li>
              <Link
                href={`/shop${buildQuery({ ...carried, category: undefined, page: undefined })}`}
                className={railRow(selected.categorySlugs.length === 0)}
              >
                <span>All</span>
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                  {facets.productTotal}
                </span>
              </Link>
            </li>
            {topLevel.map((category) => (
              <li key={category.slug}>
                <Link
                  href={toggleQuery(carried, "category", category.slug)}
                  className={railRow(selected.categorySlugs.includes(category.slug))}
                >
                  <span>{category.name}</span>
                  <span className="text-xs tabular-nums text-[var(--text-muted)]">
                    {category.productCount}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Price */}
      <section>
        <h2 className={railHeading}>Price</h2>
        <ul>
          {PRICE_BANDS.map((band) => (
            <li key={band.label}>
              <Link
                href={`/shop${buildQuery({
                  ...carried,
                  min: band.min === undefined ? undefined : String(band.min),
                  max: band.max === undefined ? undefined : String(band.max),
                  page: undefined,
                })}`}
                className={railRow(activeBand?.label === band.label)}
              >
                {band.label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Anything the bands do not cover. */}
        <form method="get" action="/shop" className="mt-3 flex items-end gap-2">
          {Object.entries(carried).flatMap(([key, value]) =>
            key === "min" || key === "max"
              ? []
              : (Array.isArray(value) ? value : value ? [value] : []).map((v, i) => (
                  <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
                )),
          )}
          <div className="flex-1">
            <label htmlFor="min" className="sr-only">
              Minimum price
            </label>
            <input
              id="min"
              name="min"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={selected.min}
              placeholder={String(Math.floor(toMajorUnits(facets.priceMin)))}
              className="lx-field py-1.5 text-sm"
            />
          </div>
          <span className="pb-2 text-xs text-[var(--text-muted)]">to</span>
          <div className="flex-1">
            <label htmlFor="max" className="sr-only">
              Maximum price
            </label>
            <input
              id="max"
              name="max"
              type="number"
              min={0}
              inputMode="numeric"
              defaultValue={selected.max}
              placeholder={String(Math.ceil(toMajorUnits(facets.priceMax)))}
              className="lx-field py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="border border-[var(--border-subtle)] px-3 py-1.5 text-xs transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Go
          </button>
        </form>
      </section>

      {/* Option facets — colour swatches first, then anything else products define */}
      {facets.options.map((option) => {
        const chosen = selected.options[option.name] ?? [];
        const isColour = option.values.some((v) => v.hexColor);

        return (
          <section key={option.name}>
            <h2 className={railHeading}>{option.name}</h2>
            {isColour ? (
              <div className="flex flex-wrap gap-2.5">
                {option.values.map((value) => {
                  const active = chosen.includes(value.value);
                  return (
                    <Link
                      key={value.value}
                      href={toggleQuery(carried, `${OPTION_PREFIX}${option.name}`, value.value)}
                      title={value.value}
                      className={cn(
                        "h-[26px] w-[26px] rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)] transition-all",
                        active && "ring-1 ring-[var(--accent)] ring-offset-2",
                      )}
                      style={{ backgroundColor: value.hexColor ?? undefined }}
                    >
                      <span className="sr-only">{value.value}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <ul>
                {option.values.map((value) => (
                  <li key={value.value}>
                    <Link
                      href={toggleQuery(carried, `${OPTION_PREFIX}${option.name}`, value.value)}
                      className={railRow(chosen.includes(value.value))}
                    >
                      {value.value}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {/* Availability */}
      <section>
        <h2 className={railHeading}>Availability</h2>
        <Link
          href={`/shop${buildQuery({
            ...carried,
            inStock: selected.inStockOnly ? undefined : "1",
            page: undefined,
          })}`}
          className="flex items-center gap-2.5 text-[13.5px] font-light text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center border text-[10px]",
              selected.inStockOnly
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "border-[var(--border-strong)]",
            )}
            aria-hidden
          >
            {selected.inStockOnly ? "✓" : ""}
          </span>
          In stock only
        </Link>
      </section>

      <Link
        href="/shop"
        className="text-xs tracking-[0.06em] text-[var(--accent-hover)] underline underline-offset-4"
      >
        Clear all filters
      </Link>
    </aside>
  );
}

/** Removable chips summarising what is currently filtered. */
export function ActiveFilters({
  selected,
  facets,
  carried,
}: {
  selected: Selected;
  facets: Facets;
  carried: Carried;
}) {
  const chips: { label: string; href: string }[] = [];

  for (const slug of selected.categorySlugs) {
    const category = facets.categories.find((c) => c.slug === slug);
    chips.push({
      label: category?.name ?? slug,
      href: removeQuery(carried, "category", slug),
    });
  }

  for (const [name, values] of Object.entries(selected.options)) {
    for (const value of values) {
      chips.push({
        label: `${name}: ${value}`,
        href: removeQuery(carried, `${OPTION_PREFIX}${name}`, value),
      });
    }
  }

  for (const tag of selected.tags) {
    chips.push({ label: tag, href: removeQuery(carried, "tag", tag) });
  }

  if (selected.inStockOnly) {
    chips.push({ label: "In stock", href: removeQuery(carried, "inStock") });
  }

  if (selected.q) {
    chips.push({ label: `“${selected.q}”`, href: removeQuery(carried, "q") });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          className="inline-flex items-center gap-1.5 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
        >
          {chip.label}
          <X className="h-3 w-3" aria-hidden />
          <span className="sr-only">Remove filter</span>
        </Link>
      ))}
      <Link href="/shop" className="text-xs underline-offset-4 hover:underline">
        Clear all
      </Link>
    </div>
  );
}
