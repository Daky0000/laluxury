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
    <aside aria-label="Filters" className="flex flex-col gap-8 lg:sticky lg:top-28 lg:self-start">
      {/* Availability */}
      <section>
        <h2 className="lx-eyebrow mb-3">Availability</h2>
        <Link
          href={`/shop${buildQuery({
            ...carried,
            inStock: selected.inStockOnly ? undefined : "1",
            page: undefined,
          })}`}
          className="flex items-center gap-2.5 text-sm"
        >
          <span
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded-sm border",
              selected.inStockOnly
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                : "border-[var(--border-subtle)]",
            )}
            aria-hidden
          >
            {selected.inStockOnly ? "✓" : ""}
          </span>
          In stock only
        </Link>
      </section>

      {/* Categories */}
      {topLevel.length > 0 ? (
        <section>
          <h2 className="lx-eyebrow mb-3">Category</h2>
          <ul className="flex flex-col gap-2">
            {topLevel.map((category) => {
              const active = selected.categorySlugs.includes(category.slug);
              return (
                <li key={category.slug}>
                  <Link
                    href={toggleQuery(carried, "category", category.slug)}
                    className={cn(
                      "flex items-center justify-between text-sm transition-colors",
                      active
                        ? "font-medium text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    <span>{category.name}</span>
                    <span className="text-xs tabular-nums text-[var(--text-muted)]">
                      {category.productCount}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Option facets — colour, size, and anything else products define */}
      {facets.options.map((option) => {
        const chosen = selected.options[option.name] ?? [];
        const isColour = option.values.some((v) => v.hexColor);

        return (
          <section key={option.name}>
            <h2 className="lx-eyebrow mb-3">{option.name}</h2>
            <div className={cn("flex flex-wrap gap-2", !isColour && "flex-col gap-2")}>
              {option.values.map((value) => {
                const active = chosen.includes(value.value);
                const href = toggleQuery(carried, `${OPTION_PREFIX}${option.name}`, value.value);

                return isColour ? (
                  <Link
                    key={value.value}
                    href={href}
                    title={value.value}
                    className={cn(
                      "h-7 w-7 rounded-full border transition-all",
                      active
                        ? "border-[var(--accent)] ring-1 ring-[var(--accent)] ring-offset-1"
                        : "border-[var(--border-subtle)]",
                    )}
                    style={{ backgroundColor: value.hexColor ?? undefined }}
                  >
                    <span className="sr-only">{value.value}</span>
                  </Link>
                ) : (
                  <Link
                    key={value.value}
                    href={href}
                    className={cn(
                      "text-sm transition-colors",
                      active
                        ? "font-medium text-[var(--text-primary)]"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                    )}
                  >
                    {value.value}
                  </Link>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Price */}
      <section>
        <h2 className="lx-eyebrow mb-3">Price</h2>
        <form method="get" action="/shop" className="flex items-end gap-2">
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
            className="rounded-[--radius-card] border border-[var(--border-subtle)] px-3 py-1.5 text-xs hover:bg-[var(--surface-sunken)]"
          >
            Go
          </button>
        </form>
      </section>

      {/* Tags */}
      {facets.tags.length > 0 ? (
        <section>
          <h2 className="lx-eyebrow mb-3">Tags</h2>
          <div className="flex flex-wrap gap-1.5">
            {facets.tags.slice(0, 12).map((tag) => {
              const active = selected.tags.includes(tag.name);
              return (
                <Link
                  key={tag.name}
                  href={toggleQuery(carried, "tag", tag.name)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                      : "border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]",
                  )}
                >
                  {tag.name}
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}
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

  if (chips.length === 0) return <div />;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Link
          key={chip.label}
          href={chip.href}
          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
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
