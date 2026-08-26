import Link from "next/link";
import { X } from "lucide-react";
import { buildQuery, cn } from "@/lib/utils";
import type { catalogFacets } from "@/lib/catalog";

/**
 * Filters are plain links over searchParams rather than client state.
 * That keeps every filtered view shareable, indexable and functional without
 * JavaScript, which matters on the patchy mobile connections a lot of Ghanaian
 * shoppers browse on.
 *
 * Layout follows the all-products artboard: category checkboxes with counts, a
 * price range and its bands, swatches and chips for whatever options the
 * catalog defines, two switches, then a clear-all.
 */

export const OPTION_PREFIX = "o_";

type Facets = Awaited<ReturnType<typeof catalogFacets>>;

type Selected = {
  categorySlugs: string[];
  tags: string[];
  options: Record<string, string[]>;
  inStockOnly: boolean;
  onSaleOnly: boolean;
  min?: string;
  max?: string;
  q?: string;
};

type Carried = Record<string, string | string[] | undefined>;

/** Price bands from the artboard, in major units. Open-ended at both ends. */
export const PRICE_BANDS: { label: string; min?: number; max?: number }[] = [
  { label: "Under ₵100", max: 99 },
  { label: "₵100–₵200", min: 100, max: 200 },
  { label: "₵200–₵350", min: 201, max: 350 },
  { label: "Over ₵350", min: 351 },
];

/** Toggles one value in a multi-select param, preserving everything else. */
function toggleQuery(carried: Carried, key: string, value: string): string {
  const current = carried[key];
  const values = Array.isArray(current) ? [...current] : current ? [current] : [];
  const index = values.indexOf(value);

  if (index >= 0) values.splice(index, 1);
  else values.push(value);

  // Changing a filter always returns to the first screenful.
  return `/shop${buildQuery({ ...carried, [key]: values, show: undefined })}`;
}

function removeQuery(carried: Carried, key: string, value?: string): string {
  if (value === undefined) {
    return `/shop${buildQuery({ ...carried, [key]: undefined, show: undefined })}`;
  }
  return toggleQuery(carried, key, value);
}

type Band = (typeof PRICE_BANDS)[number];

/** A band is a min/max pair, so selecting one replaces whatever was typed. */
function isBandActive(band: Band, selected: Pick<Selected, "min" | "max">): boolean {
  const min = band.min === undefined ? undefined : String(band.min);
  const max = band.max === undefined ? undefined : String(band.max);
  return (selected.min || undefined) === min && (selected.max || undefined) === max;
}

function bandQuery(carried: Carried, band: Band, active: boolean): string {
  return `/shop${buildQuery({
    ...carried,
    min: active || band.min === undefined ? undefined : String(band.min),
    max: active || band.max === undefined ? undefined : String(band.max),
    show: undefined,
  })}`;
}

const heading = "mb-3 text-[11px] uppercase tracking-[0.18em] text-[var(--text-primary)]";

/** The pill used for price bands and non-colour option values. */
const chipClass = (active: boolean) =>
  cn(
    "inline-flex items-center border px-3.5 py-2 text-xs transition-colors",
    active
      ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-raised)]"
      : "border-[var(--border-subtle)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
  );

/** The 42x24 switch from the artboard, as a link so it works without JS. */
function Switch({ href, label, on }: { href: string; label: string; on: boolean }) {
  return (
    <Link href={href} role="switch" aria-checked={on} className="flex items-center justify-between">
      <span className="text-[13px] text-[var(--text-secondary)]">{label}</span>
      <span
        aria-hidden
        className={cn(
          "flex h-6 w-[42px] rounded-full p-[3px] transition-colors",
          on ? "justify-end bg-sage-600" : "justify-start bg-ink-300",
        )}
      >
        <span className="block h-[18px] w-[18px] rounded-full bg-white" />
      </span>
    </Link>
  );
}

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

  return (
    <aside aria-label="Filters" className="flex flex-col gap-7 lg:sticky lg:top-28 lg:self-start">
      {/* Category */}
      {topLevel.length > 0 ? (
        <section>
          <h2 className={heading}>Category</h2>
          <ul>
            {topLevel.map((category) => {
              const active = selected.categorySlugs.includes(category.slug);
              return (
                <li key={category.slug}>
                  <Link
                    href={toggleQuery(carried, "category", category.slug)}
                    aria-pressed={active}
                    className={cn(
                      "flex w-full items-center gap-3 py-2 text-[13.5px] transition-colors",
                      active
                        ? "font-medium text-[var(--text-primary)]"
                        : "font-light text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "grid h-[17px] w-[17px] shrink-0 place-items-center border transition-colors",
                        active
                          ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-raised)]"
                          : "border-[var(--border-strong)]",
                      )}
                    >
                      {active ? (
                        <svg viewBox="0 0 24 24" className="h-[11px] w-[11px]" fill="none">
                          <path
                            d="M5 12.5l4.5 4.5L19 7.5"
                            stroke="currentColor"
                            strokeWidth={3}
                            strokeLinecap="square"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className="flex-1 text-left">{category.name}</span>
                    <span className="text-xs tabular-nums text-ink-400">
                      {category.productCount}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Price */}
      <section>
        <h2 className={heading}>Price</h2>

        <form method="get" action="/shop" className="mb-3 flex items-center gap-2">
          {Object.entries(carried).flatMap(([key, value]) =>
            key === "min" || key === "max" || key === "show"
              ? []
              : (Array.isArray(value) ? value : value ? [value] : []).map((v, i) => (
                  <input key={`${key}-${i}`} type="hidden" name={key} value={v} />
                )),
          )}
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
            placeholder="Min"
            className="lx-field min-w-0 flex-1 px-3 py-2.5 text-[13px]"
          />
          <span aria-hidden className="text-[13px] text-ink-400">
            &mdash;
          </span>
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
            placeholder="Max"
            className="lx-field min-w-0 flex-1 px-3 py-2.5 text-[13px]"
          />
          {/* The artboard filters as you type; without JS the range still needs
              something to press, so it keeps a compact submit. */}
          <button
            type="submit"
            className="shrink-0 border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-2.5 text-xs text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)]"
          >
            Go
          </button>
        </form>

        <div className="flex flex-wrap gap-2">
          {PRICE_BANDS.map((band) => {
            const active = isBandActive(band, selected);
            return (
              <Link
                key={band.label}
                href={bandQuery(carried, band, active)}
                aria-pressed={active}
                className={chipClass(active)}
              >
                {band.label}
              </Link>
            );
          })}
        </div>
      </section>

      {/* Whatever the catalog defines: swatches where the owner set hex values,
          chips for sizes, widths and lengths. */}
      {facets.options.map((option) => {
        const chosen = selected.options[option.name] ?? [];
        const isColour = option.values.some((v) => v.hexColor);

        return (
          <section key={option.name}>
            <h2 className={heading}>{option.name}</h2>
            {isColour ? (
              <div className="flex flex-wrap gap-2.5">
                {option.values.map((value) => {
                  const active = chosen.includes(value.value);
                  return (
                    <Link
                      key={value.value}
                      href={toggleQuery(carried, `${OPTION_PREFIX}${option.name}`, value.value)}
                      title={value.value}
                      aria-pressed={active}
                      className={cn(
                        "grid h-[34px] w-[34px] place-items-center rounded-full border transition-colors",
                        active ? "border-[var(--text-primary)]" : "border-[var(--border-strong)]",
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "block rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.1)] transition-all duration-150",
                          active ? "h-[18px] w-[18px]" : "h-6 w-6",
                        )}
                        style={{ backgroundColor: value.hexColor ?? undefined }}
                      />
                      <span className="sr-only">{value.value}</span>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const active = chosen.includes(value.value);
                  return (
                    <Link
                      key={value.value}
                      href={toggleQuery(carried, `${OPTION_PREFIX}${option.name}`, value.value)}
                      aria-pressed={active}
                      className={chipClass(active)}
                    >
                      {value.value}
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      {/* Availability and sale */}
      <section className="flex flex-col gap-3.5 border-t border-[var(--border-subtle)] pt-5">
        <h2 className="sr-only">Availability</h2>
        <Switch
          href={`/shop${buildQuery({
            ...carried,
            inStock: selected.inStockOnly ? undefined : "1",
            show: undefined,
          })}`}
          label="In stock only"
          on={selected.inStockOnly}
        />
        <Switch
          href={`/shop${buildQuery({
            ...carried,
            onSale: selected.onSaleOnly ? undefined : "1",
            show: undefined,
          })}`}
          label="On sale"
          on={selected.onSaleOnly}
        />
      </section>

      <Link
        href="/shop"
        className="self-start text-xs tracking-[0.06em] text-[var(--accent-hover)] underline underline-offset-4"
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
    chips.push({ label: category?.name ?? slug, href: removeQuery(carried, "category", slug) });
  }

  for (const [name, values] of Object.entries(selected.options)) {
    for (const value of values) {
      chips.push({ label: value, href: removeQuery(carried, `${OPTION_PREFIX}${name}`, value) });
    }
  }

  for (const tag of selected.tags) {
    chips.push({ label: tag, href: removeQuery(carried, "tag", tag) });
  }

  const band = PRICE_BANDS.find((b) => isBandActive(b, selected));

  if (band) {
    chips.push({
      label: band.label,
      href: `/shop${buildQuery({ ...carried, min: undefined, max: undefined, show: undefined })}`,
    });
  } else {
    if (selected.min) {
      chips.push({ label: `Min ₵${selected.min}`, href: removeQuery(carried, "min") });
    }
    if (selected.max) {
      chips.push({ label: `Max ₵${selected.max}`, href: removeQuery(carried, "max") });
    }
  }

  if (selected.inStockOnly) {
    chips.push({ label: "In stock", href: removeQuery(carried, "inStock") });
  }

  if (selected.onSaleOnly) {
    chips.push({ label: "On sale", href: removeQuery(carried, "onSale") });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="text-[11px] uppercase tracking-[0.14em] text-[var(--text-muted)]">
        Filtering by
      </span>
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          className="inline-flex items-center gap-2 bg-[var(--text-primary)] px-3.5 py-1.5 text-xs text-[var(--surface-raised)] transition-opacity hover:opacity-80"
        >
          {chip.label}
          <X className="h-3 w-3" strokeWidth={2.2} aria-hidden />
          <span className="sr-only">Remove filter</span>
        </Link>
      ))}
      <Link
        href="/shop"
        className="px-1 text-xs text-[var(--accent-hover)] underline underline-offset-4"
      >
        Clear all
      </Link>
    </div>
  );
}
