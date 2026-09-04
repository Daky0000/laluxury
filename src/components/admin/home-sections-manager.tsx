"use client";

import { useActionState, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import { updateHomeSectionsAction } from "@/app/actions/admin/system";
import type { AdminState } from "@/app/actions/admin/products";
import {
  SECTION_KINDS,
  SECTION_TYPES,
  newSection,
  type HomeSection,
  type HomeSectionType,
  type ProductSource,
} from "@/lib/home-sections";
import { Card, Field, Alert, Badge } from "@/components/ui";

export type CategoryChoice = { name: string; slug: string; count: number };
export type ProductChoice = { id: string; title: string; category: string };

/**
 * The home page builder.
 *
 * The whole list is edited locally and posted in one go, so reordering,
 * hiding and deleting never half-save: what is on screen when Save is pressed
 * is what the storefront renders.
 */
export function HomeSectionsManager({
  initial,
  categories,
  products,
}: {
  initial: HomeSection[];
  categories: CategoryChoice[];
  products: ProductChoice[];
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    updateHomeSectionsAction,
    null,
  );
  const [sections, setSections] = useState<HomeSection[]>(initial);
  const [open, setOpen] = useState<string | null>(null);

  const update = (id: string, patch: Partial<HomeSection>) =>
    setSections((prev) =>
      prev.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    );

  const move = (index: number, by: number) =>
    setSections((prev) => {
      const next = [...prev];
      const to = index + by;
      if (to < 0 || to >= next.length) return prev;
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const remove = (id: string) => setSections((prev) => prev.filter((s) => s.id !== id));

  const add = (type: HomeSectionType) => {
    // Ids end up in the page as anchors, so they stay readable rather than
    // random: "products", then "products-2", and so on.
    const used = new Set(sections.map((s) => s.id));
    let id: string = type;
    for (let n = 2; used.has(id); n += 1) id = `${type}-${n}`;

    setSections((prev) => [...prev, newSection(type, id)]);
    setOpen(id);
  };

  // A hero, a bundle banner and a newsletter can each appear once; the others
  // as often as the owner likes.
  const canAdd = (type: HomeSectionType) =>
    !SECTION_KINDS[type].unique || !sections.some((section) => section.type === type);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="sections" value={JSON.stringify(sections)} />

      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}

      <ul className="flex flex-col gap-3">
        {sections.map((section, index) => {
          const kind = SECTION_KINDS[section.type];
          const isOpen = open === section.id;

          return (
            <li key={section.id}>
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move ${section.title} up`}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === sections.length - 1}
                      aria-label={`Move ${section.title} down`}
                      className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden />
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : section.id)}
                    aria-expanded={isOpen}
                    className="flex min-w-40 flex-1 flex-col items-start text-left"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {section.title || kind.label}
                      {!section.visible ? <Badge tone="neutral">hidden</Badge> : null}
                    </span>
                    <span className="text-sm text-[var(--text-muted)]">{kind.label}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => update(section.id, { visible: !section.visible })}
                    aria-label={
                      section.visible ? `Hide ${section.title}` : `Show ${section.title}`
                    }
                    className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                  >
                    {section.visible ? (
                      <Eye className="h-4 w-4" aria-hidden />
                    ) : (
                      <EyeOff className="h-4 w-4" aria-hidden />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => remove(section.id)}
                    aria-label={`Delete ${section.title}`}
                    className="text-[var(--text-muted)] hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </button>
                </div>

                {isOpen ? (
                  <div className="border-t border-[var(--border-subtle)] bg-[var(--surface-sunken)] px-4 py-4">
                    <p className="mb-4 text-sm text-[var(--text-secondary)]">{kind.description}</p>

                    {kind.copyFromSettings ? (
                      <p className="text-sm text-[var(--text-secondary)]">
                        This section&rsquo;s wording, image and links are edited under{" "}
                        <span className="font-medium">Settings &rarr; Home page</span>. Here you
                        choose where it sits and whether it shows.
                      </p>
                    ) : (
                      <SectionFields
                        section={section}
                        categories={categories}
                        products={products}
                        onChange={(patch) => update(section.id, patch)}
                      />
                    )}
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="lx-eyebrow">Add a section</h2>
        <div className="flex flex-wrap gap-2">
          {SECTION_TYPES.filter(canAdd).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => add(type)}
              className="inline-flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm hover:border-[var(--accent)]"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              {SECTION_KINDS[type].label}
            </button>
          ))}
        </div>
      </Card>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Save home page
        </button>
      </div>
    </form>
  );
}

const SOURCE_LABELS: Record<ProductSource, string> = {
  auto: "Fill automatically",
  category: "Everything in chosen categories",
  picked: "Only the products I pick",
};

/** The fields a rooms or products section actually reads. */
function SectionFields({
  section,
  categories,
  products,
  onChange,
}: {
  section: HomeSection;
  categories: CategoryChoice[];
  products: ProductChoice[];
  onChange: (patch: Partial<HomeSection>) => void;
}) {
  const kind = SECTION_KINDS[section.type];
  const picking = section.type === "products" && section.source === "picked";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Eyebrow" htmlFor={`${section.id}-eyebrow`} hint="Small line above the heading.">
          <input
            id={`${section.id}-eyebrow`}
            value={section.eyebrow}
            onChange={(e) => onChange({ eyebrow: e.target.value })}
            className="lx-field"
          />
        </Field>

        <Field label="Heading" htmlFor={`${section.id}-title`}>
          <input
            id={`${section.id}-title`}
            value={section.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="lx-field"
          />
        </Field>
      </div>

      {kind.fields.layout ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Layout" htmlFor={`${section.id}-layout`}>
            <select
              id={`${section.id}-layout`}
              value={section.layout}
              onChange={(e) => onChange({ layout: e.target.value as HomeSection["layout"] })}
              className="lx-field"
            >
              <option value="row">One row</option>
              <option value="tabs">Grid with room tabs</option>
            </select>
          </Field>

          <Field label="Background" htmlFor={`${section.id}-tone`}>
            <select
              id={`${section.id}-tone`}
              value={section.tone}
              onChange={(e) => onChange({ tone: e.target.value as HomeSection["tone"] })}
              className="lx-field"
            >
              <option value="paper">Page paper</option>
              <option value="sage">Sage panel</option>
            </select>
          </Field>

          <Field
            label="Shop all link"
            htmlFor={`${section.id}-href`}
            hint="Blank hides the link."
          >
            <input
              id={`${section.id}-href`}
              value={section.href}
              onChange={(e) => onChange({ href: e.target.value })}
              placeholder="/shop?category=student"
              className="lx-field"
            />
          </Field>
        </div>
      ) : null}

      {kind.fields.products ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Which products" htmlFor={`${section.id}-source`}>
            <select
              id={`${section.id}-source`}
              value={section.source}
              onChange={(e) => onChange({ source: e.target.value as ProductSource })}
              className="lx-field"
            >
              {(Object.keys(SOURCE_LABELS) as ProductSource[]).map((source) => (
                <option key={source} value={source}>
                  {SOURCE_LABELS[source]}
                </option>
              ))}
            </select>
          </Field>

          {!picking ? (
            <Field
              label="How many"
              htmlFor={`${section.id}-limit`}
              hint="The most this section will show."
            >
              <input
                id={`${section.id}-limit`}
                type="number"
                min={1}
                max={48}
                value={section.limit}
                onChange={(e) => onChange({ limit: Math.max(1, Number(e.target.value) || 1) })}
                className="lx-field"
              />
            </Field>
          ) : null}
        </div>
      ) : null}

      {kind.fields.categories && !picking ? (
        <CategoryPicker
          section={section}
          categories={categories}
          onChange={onChange}
          limitField={section.type === "rooms"}
        />
      ) : null}

      {picking ? (
        <ProductPicker section={section} products={products} onChange={onChange} />
      ) : null}
    </div>
  );
}

/**
 * The cards, or the rooms a product section draws from. Checking a category
 * appends it, so the check order is the order the cards appear in; the list
 * underneath is what the page will render, and each entry can be dropped.
 */
function CategoryPicker({
  section,
  categories,
  onChange,
  limitField,
}: {
  section: HomeSection;
  categories: CategoryChoice[];
  onChange: (patch: Partial<HomeSection>) => void;
  /** Room sections fall back to a count when nothing is chosen. */
  limitField: boolean;
}) {
  const chosen = section.categorySlugs;
  const byslug = useMemo(
    () => new Map(categories.map((category) => [category.slug, category])),
    [categories],
  );

  const toggle = (slug: string) =>
    onChange({
      categorySlugs: chosen.includes(slug)
        ? chosen.filter((s) => s !== slug)
        : [...chosen, slug],
    });

  const moveChosen = (index: number, by: number) => {
    const next = [...chosen];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onChange({ categorySlugs: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="lx-eyebrow">
          {section.type === "rooms" ? "Cards" : "Categories"}
        </span>
        <span className="text-sm text-[var(--text-muted)]">
          {chosen.length === 0
            ? section.type === "rooms"
              ? "None chosen — every room shows, newest first."
              : "None chosen — every room becomes a tab."
            : `${chosen.length} chosen`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((category) => {
          const on = chosen.includes(category.slug);
          return (
            <button
              key={category.slug}
              type="button"
              onClick={() => toggle(category.slug)}
              aria-pressed={on}
              className={`rounded-(--radius-card) border px-3 py-1.5 text-sm ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-contrast)]"
                  : "border-[var(--border-subtle)] bg-[var(--surface-raised)] hover:border-[var(--accent)]"
              }`}
            >
              {category.name}
              <span className={on ? "opacity-70" : "text-[var(--text-muted)]"}> · {category.count}</span>
            </button>
          );
        })}
      </div>

      {chosen.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {chosen.map((slug, index) => (
            <li
              key={slug}
              className="flex items-center gap-2 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
            >
              <span className="w-5 text-[var(--text-muted)] tabular-nums">{index + 1}</span>
              <span className="flex-1">{byslug.get(slug)?.name ?? slug}</span>
              <button
                type="button"
                onClick={() => moveChosen(index, -1)}
                disabled={index === 0}
                aria-label={`Move ${slug} earlier`}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => moveChosen(index, 1)}
                disabled={index === chosen.length - 1}
                aria-label={`Move ${slug} later`}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => toggle(slug)}
                aria-label={`Remove ${slug}`}
                className="text-[var(--text-muted)] hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {limitField && chosen.length === 0 ? (
        <Field label="How many cards" htmlFor={`${section.id}-limit`}>
          <input
            id={`${section.id}-limit`}
            type="number"
            min={1}
            max={12}
            value={section.limit}
            onChange={(e) => onChange({ limit: Math.max(1, Number(e.target.value) || 1) })}
            className="lx-field max-w-32"
          />
        </Field>
      ) : null}
    </div>
  );
}

/** Hand-picked products, in the order they will appear. */
function ProductPicker({
  section,
  products,
  onChange,
}: {
  section: HomeSection;
  products: ProductChoice[];
  onChange: (patch: Partial<HomeSection>) => void;
}) {
  const [query, setQuery] = useState("");
  const chosen = section.productIds;
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    const pool = term
      ? products.filter(
          (p) =>
            p.title.toLowerCase().includes(term) || p.category.toLowerCase().includes(term),
        )
      : products;
    return pool.slice(0, 40);
  }, [products, query]);

  const toggle = (id: string) =>
    onChange({
      productIds: chosen.includes(id) ? chosen.filter((p) => p !== id) : [...chosen, id],
    });

  const moveChosen = (index: number, by: number) => {
    const next = [...chosen];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onChange({ productIds: next });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="lx-eyebrow">Products</span>
        <span className="text-sm text-[var(--text-muted)]">
          {chosen.length === 0 ? "Nothing picked — the section stays off the page." : `${chosen.length} picked`}
        </span>
      </div>

      {chosen.length > 0 ? (
        <ol className="flex flex-col gap-1.5">
          {chosen.map((id, index) => (
            <li
              key={id}
              className="flex items-center gap-2 rounded-(--radius-card) border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-3 py-2 text-sm"
            >
              <span className="w-5 text-[var(--text-muted)] tabular-nums">{index + 1}</span>
              <span className="flex-1 truncate">{byId.get(id)?.title ?? id}</span>
              <button
                type="button"
                onClick={() => moveChosen(index, -1)}
                disabled={index === 0}
                aria-label="Move earlier"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => moveChosen(index, 1)}
                disabled={index === chosen.length - 1}
                aria-label="Move later"
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-30"
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => toggle(id)}
                aria-label="Remove"
                className="text-[var(--text-muted)] hover:text-danger"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search products"
          aria-label="Search products"
          className="lx-field pl-9"
        />
      </div>

      <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto">
        {matches.map((product) => (
          <li key={product.id}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-(--radius-card) px-2 py-1.5 text-sm hover:bg-[var(--surface-raised)]">
              <input
                type="checkbox"
                checked={chosen.includes(product.id)}
                onChange={() => toggle(product.id)}
                className="accent-[var(--accent)]"
              />
              <span className="flex-1 truncate">{product.title}</span>
              {product.category ? (
                <span className="text-sm text-[var(--text-muted)]">{product.category}</span>
              ) : null}
            </label>
          </li>
        ))}
        {matches.length === 0 ? (
          <li className="px-2 py-3 text-sm text-[var(--text-muted)]">
            Nothing matches &ldquo;{query}&rdquo;.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
