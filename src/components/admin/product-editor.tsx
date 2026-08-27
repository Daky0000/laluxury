"use client";

import { useActionState, useRef, useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Trash2, ArrowUp, ArrowDown, ExternalLink, Plus, Upload, X } from "lucide-react";
import {
  updateProductAction,
  updateVariantsAction,
  addOptionAction,
  updateOptionAction,
  deleteOptionAction,
  addImageAction,
  setImageOptionValueAction,
  deleteImageAction,
  moveImageAction,
  deleteProductAction,
  type AdminState,
} from "@/app/actions/admin/products";
import { uploadProductImagesAction } from "@/app/actions/admin/media";
import { Card, Field, Alert, Badge } from "@/components/ui";
import { toMajorUnits } from "@/lib/money";
import { cn } from "@/lib/utils";

export type EditorProduct = {
  id: string;
  title: string;
  slug: string;
  shortDescription: string | null;
  description: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  brand: string | null;
  material: string | null;
  care: string | null;
  tags: string[];
  isFeatured: boolean;
  metaTitle: string | null;
  metaDescription: string | null;
  categoryIds: string[];
  collectionIds: string[];
  options: {
    id: string;
    name: string;
    values: { id: string; value: string; hexColor: string | null }[];
  }[];
  variants: {
    id: string;
    title: string;
    sku: string;
    barcode: string | null;
    price: number;
    compareAtPrice: number | null;
    costPrice: number | null;
    weightGrams: number | null;
    isActive: boolean;
    onHand: number;
    reserved: number;
  }[];
  images: { id: string; url: string; alt: string | null; optionValueId: string | null }[];
};

type Ref = { id: string; name: string };
type Tab = "details" | "variants" | "images";

export function ProductEditor({
  product,
  categories,
  collections,
}: {
  product: EditorProduct;
  categories: Ref[];
  collections: Ref[];
}) {
  const [tab, setTab] = useState<Tab>("details");

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: "details", label: "Details" },
    { id: "variants", label: "Variants", count: product.variants.length },
    { id: "images", label: "Images", count: product.images.length },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 border-b border-[var(--border-subtle)]">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-4 py-2.5 text-sm transition-colors",
                tab === t.id
                  ? "border-[var(--accent)] text-[var(--text-primary)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {t.label}
              {t.count !== undefined ? (
                <span className="ml-1.5 text-xs text-[var(--text-muted)]">{t.count}</span>
              ) : null}
            </button>
          ))}
        </div>

        <Link
          href={`/product/${product.slug}`}
          target="_blank"
          className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          View on site
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </div>

      {tab === "details" ? (
        <DetailsTab product={product} categories={categories} collections={collections} />
      ) : null}
      {tab === "variants" ? <VariantsTab product={product} /> : null}
      {tab === "images" ? <ImagesTab product={product} /> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DetailsTab({
  product,
  categories,
  collections,
}: {
  product: EditorProduct;
  categories: Ref[];
  collections: Ref[];
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    updateProductAction.bind(null, product.id),
    null,
  );
  const [deleting, startDelete] = useTransition();
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <form action={action} className="flex flex-col gap-6">
        {state?.message ? (
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        ) : null}

        <Card className="flex flex-col gap-4 p-5">
          <Field label="Product name" htmlFor="title" required>
            <input id="title" name="title" required defaultValue={product.title} className="lx-field" />
          </Field>

          <Field label="Short description" htmlFor="shortDescription">
            <input
              id="shortDescription"
              name="shortDescription"
              defaultValue={product.shortDescription ?? ""}
              className="lx-field"
            />
          </Field>

          <Field label="Description" htmlFor="description">
            <textarea
              id="description"
              name="description"
              rows={6}
              defaultValue={product.description ?? ""}
              className="lx-field resize-y"
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Brand" htmlFor="brand">
              <input id="brand" name="brand" defaultValue={product.brand ?? ""} className="lx-field" />
            </Field>
            <Field label="Material" htmlFor="material">
              <input
                id="material"
                name="material"
                defaultValue={product.material ?? ""}
                className="lx-field"
              />
            </Field>
            <Field label="Care" htmlFor="care">
              <input id="care" name="care" defaultValue={product.care ?? ""} className="lx-field" />
            </Field>
          </div>

          <Field label="Tags" htmlFor="tags" hint="Comma separated.">
            <input
              id="tags"
              name="tags"
              defaultValue={product.tags.join(", ")}
              className="lx-field"
            />
          </Field>
        </Card>

        <Card className="grid gap-4 p-5 sm:grid-cols-2">
          <fieldset>
            <legend className="lx-eyebrow mb-2">Categories</legend>
            <div className="flex flex-col gap-1.5">
              {categories.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="categoryIds"
                    value={c.id}
                    defaultChecked={product.categoryIds.includes(c.id)}
                    className="accent-[var(--accent)]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="lx-eyebrow mb-2">Collections</legend>
            <div className="flex flex-col gap-1.5">
              {collections.map((c) => (
                <label key={c.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="collectionIds"
                    value={c.id}
                    defaultChecked={product.collectionIds.includes(c.id)}
                    className="accent-[var(--accent)]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </fieldset>
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <h3 className="lx-eyebrow">Search engine listing</h3>
          <Field label="Meta title" htmlFor="metaTitle">
            <input
              id="metaTitle"
              name="metaTitle"
              defaultValue={product.metaTitle ?? ""}
              placeholder={product.title}
              className="lx-field"
            />
          </Field>
          <Field label="Meta description" htmlFor="metaDescription">
            <textarea
              id="metaDescription"
              name="metaDescription"
              rows={2}
              defaultValue={product.metaDescription ?? ""}
              placeholder={product.shortDescription ?? ""}
              className="lx-field resize-y"
            />
          </Field>
        </Card>

        <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
          <Field label="Status" htmlFor="status">
            <select
              id="status"
              name="status"
              defaultValue={product.status}
              className="lx-field w-44"
            >
              <option value="DRAFT">Draft</option>
              <option value="ACTIVE">Active</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </Field>

          <label className="flex items-center gap-2 pb-2.5 text-sm">
            <input
              type="checkbox"
              name="isFeatured"
              defaultChecked={product.isFeatured}
              className="accent-[var(--accent)]"
            />
            Feature on the homepage
          </label>

          <button
            type="submit"
            disabled={pending}
            className="flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save changes
          </button>
        </Card>
      </form>

      <Card className="border-danger/30 p-5">
        <h3 className="text-sm font-medium">Delete this product</h3>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Products with sales history are archived instead, so past orders stay readable.
        </p>
        {deleteMessage ? (
          <p className="mt-2 text-sm text-warning">{deleteMessage}</p>
        ) : null}
        <button
          type="button"
          disabled={deleting}
          onClick={() => {
            if (!confirm(`Delete "${product.title}"? This cannot be undone.`)) return;
            startDelete(async () => {
              const result = await deleteProductAction(product.id);
              if (result.message) setDeleteMessage(result.message);
            });
          }}
          className="mt-3 flex items-center gap-2 rounded-(--radius-card) border border-danger px-4 py-2 text-sm text-danger disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          Delete product
        </button>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** A value being edited. `id` is absent until it has been saved once. */
type ValueRow = { key: string; id?: string; value: string; hex: string | null };

/** What the colour input falls back to before a colour has been chosen. */
const DEFAULT_SWATCH = "#8B7355";

let rowSeq = 0;
const nextKey = () => `row-${(rowSeq += 1)}`;

/**
 * One option, editable in place: rename it, retype its values, reorder them,
 * give the colour ones a colour, add and remove.
 *
 * Values are edited rather than replaced wholesale because the value's id is
 * what variants — and any image pinned to a colour — hang off. Retyping
 * "Sea Blue" as "Ocean Blue" keeps the variants and their stock, and keeps the
 * photograph attached; deleting and re-adding would lose both.
 *
 * The whole list posts as one JSON field. Per-row form names would have to
 * encode the id, the colour and whether the row was new into the name itself,
 * and reordering would then mean renaming the fields.
 */
function OptionEditor({
  productId,
  option,
  onRemove,
  removing,
}: {
  productId: string;
  option: EditorProduct["options"][number];
  onRemove: () => void;
  removing: boolean;
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    updateOptionAction.bind(null, productId, option.id),
    null,
  );

  const [name, setName] = useState(option.name);
  const [rows, setRows] = useState<ValueRow[]>(() =>
    option.values.map((v) => ({ key: v.id, id: v.id, value: v.value, hex: v.hexColor })),
  );

  function patch(key: string, change: Partial<ValueRow>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...change } : row)));
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    setRows((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  const payload = JSON.stringify(
    rows
      .filter((row) => row.value.trim().length > 0)
      .map((row) => ({ id: row.id, value: row.value.trim(), hex: row.hex })),
  );

  return (
    <form
      action={action}
      className="rounded-(--radius-card) border border-[var(--border-subtle)] p-4"
    >
      <input type="hidden" name="values" value={payload} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <Field label="Option name" htmlFor={`name-${option.id}`} className="w-48">
          <input
            id={`name-${option.id}`}
            name="optionName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="lx-field py-1.5"
          />
        </Field>

        <button
          type="button"
          disabled={removing}
          onClick={onRemove}
          className="mb-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-danger disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove option
        </button>
      </div>

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((row, index) => (
          <li key={row.key} className="flex flex-wrap items-center gap-2">
            <span className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="rounded px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-25"
                aria-label={`Move ${row.value || "value"} up`}
              >
                <ArrowUp className="h-3 w-3" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                className="rounded px-1 text-[var(--text-muted)] hover:text-[var(--text-primary)] disabled:opacity-25"
                aria-label={`Move ${row.value || "value"} down`}
              >
                <ArrowDown className="h-3 w-3" aria-hidden />
              </button>
            </span>

            {/* Free text, stored exactly as typed — "3ft" stays "3ft". */}
            <input
              value={row.value}
              onChange={(event) => patch(row.key, { value: event.target.value })}
              placeholder="Sea Blue"
              aria-label="Value"
              className="lx-field w-44 py-1.5"
            />

            {row.hex === null ? (
              <button
                type="button"
                onClick={() => patch(row.key, { hex: DEFAULT_SWATCH })}
                className="rounded-(--radius-card) border border-dashed border-[var(--border-strong)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Add colour
              </button>
            ) : (
              <span className="flex items-center gap-1.5">
                <input
                  type="color"
                  value={row.hex}
                  onChange={(event) => patch(row.key, { hex: event.target.value })}
                  aria-label={`Colour for ${row.value || "value"}`}
                  className="h-8 w-9 cursor-pointer rounded border border-[var(--border-subtle)] bg-transparent p-0.5"
                />
                {/* Typed as well as picked, so a brand hex can be pasted in. */}
                <input
                  value={row.hex}
                  onChange={(event) => patch(row.key, { hex: event.target.value })}
                  aria-label={`Colour code for ${row.value || "value"}`}
                  spellCheck={false}
                  className="lx-field w-24 py-1.5 font-mono text-xs uppercase"
                />
                <button
                  type="button"
                  onClick={() => patch(row.key, { hex: null })}
                  className="rounded p-1 text-[var(--text-muted)] hover:text-danger"
                  aria-label={`Remove the colour from ${row.value || "value"}`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </span>
            )}

            <button
              type="button"
              onClick={() => setRows((current) => current.filter((r) => r.key !== row.key))}
              disabled={rows.length === 1}
              className="ml-auto rounded p-1.5 text-[var(--text-secondary)] hover:text-danger disabled:opacity-30"
              aria-label={`Remove ${row.value || "value"}`}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setRows((current) => [...current, { key: nextKey(), value: "", hex: null }])
          }
          className="flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] px-3 py-1.5 text-xs"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Add value
        </button>

        <button
          type="submit"
          disabled={pending}
          className="rounded-(--radius-card) bg-[var(--accent)] px-4 py-1.5 text-xs text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save option"}
        </button>

        {state?.message ? (
          <span className={cn("text-xs", state.ok ? "text-success" : "text-danger")}>
            {state.message}
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-xs text-[var(--text-muted)]">
        Values are stored exactly as typed, units and all. Adding or removing one rebuilds the
        variant list; the ones that still apply keep their price and stock.
      </p>
    </form>
  );
}

function VariantsTab({ product }: { product: EditorProduct }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    updateVariantsAction.bind(null, product.id),
    null,
  );
  const [optionState, optionAction, optionPending] = useActionState<AdminState | null, FormData>(
    addOptionAction.bind(null, product.id),
    null,
  );
  const [removing, startRemove] = useTransition();

  return (
    <div className="flex flex-col gap-6">
      {/* Options */}
      <Card className="p-5">
        <h3 className="lx-eyebrow mb-3">Options</h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Adding an option generates every combination as a variant. Existing variants keep their
          price and stock.
        </p>

        {product.options.length > 0 ? (
          <div className="mb-5 flex flex-col gap-3">
            {product.options.map((option) => (
              <OptionEditor
                key={option.id}
                productId={product.id}
                option={option}
                onRemove={() => {
                  if (!confirm(`Remove the ${option.name} option and rebuild variants?`)) return;
                  startRemove(async () => {
                    await deleteOptionAction(product.id, option.id);
                  });
                }}
                removing={removing}
              />
            ))}
          </div>
        ) : null}

        <form action={optionAction} className="flex flex-wrap items-end gap-3">
          <Field label="Option name" htmlFor="optionName" className="w-40">
            <input id="optionName" name="optionName" placeholder="Colour" className="lx-field" />
          </Field>
          <Field
            label="Values"
            htmlFor="optionValues"
            hint="Comma separated"
            className="min-w-56 flex-1"
          >
            <input
              id="optionValues"
              name="optionValues"
              placeholder="Ivory, Clay, Obsidian"
              className="lx-field"
            />
          </Field>
          <button
            type="submit"
            disabled={optionPending}
            className="flex items-center gap-1.5 rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-2.5 text-sm disabled:opacity-50"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Add option
          </button>
        </form>

        {optionState?.message ? (
          <p className={cn("mt-3 text-sm", optionState.ok ? "text-success" : "text-danger")}>
            {optionState.message}
          </p>
        ) : null}
      </Card>

      {/* Variant table */}
      <form action={action}>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-[var(--border-subtle)] bg-[var(--surface-sunken)] text-left">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Variant</th>
                  <th className="px-3 py-2.5 font-medium">SKU</th>
                  <th className="px-3 py-2.5 font-medium">Price</th>
                  <th className="px-3 py-2.5 font-medium">Was</th>
                  <th className="px-3 py-2.5 font-medium">Cost</th>
                  <th className="px-3 py-2.5 font-medium">Weight (g)</th>
                  <th className="px-3 py-2.5 font-medium">Stock</th>
                  <th className="px-3 py-2.5 font-medium">Active</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {product.variants.map((variant) => (
                  <tr key={variant.id}>
                    <td className="px-4 py-2.5">{variant.title}</td>
                    <td className="px-3 py-2.5">
                      <input
                        name={`sku_${variant.id}`}
                        defaultValue={variant.sku}
                        aria-label={`SKU for ${variant.title}`}
                        className="lx-field w-32 py-1.5 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        name={`price_${variant.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={toMajorUnits(variant.price)}
                        aria-label={`Price for ${variant.title}`}
                        className="lx-field w-24 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        name={`compareAt_${variant.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={
                          variant.compareAtPrice ? toMajorUnits(variant.compareAtPrice) : ""
                        }
                        aria-label={`Compare-at price for ${variant.title}`}
                        className="lx-field w-24 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        name={`cost_${variant.id}`}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={variant.costPrice ? toMajorUnits(variant.costPrice) : ""}
                        aria-label={`Cost for ${variant.title}`}
                        className="lx-field w-24 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        name={`weight_${variant.id}`}
                        type="number"
                        min="0"
                        defaultValue={variant.weightGrams ?? ""}
                        aria-label={`Weight for ${variant.title}`}
                        className="lx-field w-20 py-1.5"
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="tabular-nums">{variant.onHand - variant.reserved}</span>
                      {variant.reserved > 0 ? (
                        <span className="ml-1 text-xs text-[var(--text-muted)]">
                          ({variant.reserved} held)
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        name={`active_${variant.id}`}
                        defaultChecked={variant.isActive}
                        aria-label={`${variant.title} active`}
                        className="accent-[var(--accent)]"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-[var(--border-subtle)] px-4 py-3">
            <p className="text-xs text-[var(--text-muted)]">
              Stock is edited in Inventory, where every change is logged.
            </p>
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-5 py-2 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Save variants
            </button>
          </div>
        </Card>
      </form>

      {state?.message ? (
        <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

/**
 * Upload straight from the machine you are on.
 *
 * Files go to the image CDN and only the delivered URL is stored — a container
 * filesystem would lose them on the next deploy.
 */
type Picked = { file: File; preview: string };

function UploadImages({
  product,
  allValues,
}: {
  product: EditorProduct;
  allValues: { id: string; value: string; optionName: string }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [picked, setPicked] = useState<Picked[]>([]);

  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      // The visible list is the source of truth, not the file input — a picture
      // removed from the strip must not still be uploaded.
      formData.delete("files");
      for (const item of picked) formData.append("files", item.file);

      const result = await uploadProductImagesAction(product.id, prev, formData);
      if (result.ok) {
        for (const item of picked) URL.revokeObjectURL(item.preview);
        setPicked([]);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      }
      return result;
    },
    null,
  );

  function choose(files: FileList | null) {
    const incoming = Array.from(files ?? []);
    if (incoming.length === 0) return;

    setPicked((current) => [
      ...current,
      // Object URLs render the picture immediately, before anything is uploaded.
      ...incoming.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);

    // Cleared so choosing the same file again still fires a change event.
    if (inputRef.current) inputRef.current.value = "";
  }

  function remove(index: number) {
    setPicked((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, i) => i !== index);
    });
  }

  return (
    <Card className="p-5">
      <h3 className="lx-eyebrow mb-3">Upload photos</h3>

      {state?.message ? (
        <div className="mb-4">
          <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
        </div>
      ) : null}

      <form action={action} className="flex flex-col gap-4">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
          multiple
          className="sr-only"
          onChange={(event) => choose(event.target.files)}
        />

        {/* Drop zone doubles as the preview strip once something is chosen. */}
        <div
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            choose(event.dataTransfer.files);
          }}
          className="flex flex-col gap-4 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface-sunken)] p-4"
        >
          {picked.length > 0 ? (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {picked.map((item, index) => (
                <li
                  key={item.preview}
                  className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.preview}
                    alt={item.file.name}
                    className="h-full w-full object-cover"
                  />
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-ink-900/75 text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={`Remove ${item.file.name}`}
                  >
                    <X className="h-3.5 w-3.5" aria-hidden />
                  </button>
                  <span className="absolute inset-x-0 bottom-0 truncate bg-ink-900/70 px-1.5 py-0.5 text-[10px] text-white">
                    {item.file.name}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center">
              <Upload className="h-6 w-6 text-[var(--text-muted)]" aria-hidden />
              <p className="text-sm">Drop images here, or add them below</p>
              <p className="text-xs text-[var(--text-muted)]">
                JPEG, PNG, WebP or AVIF · up to 8 MB each
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-[var(--border-strong)] bg-[var(--surface-raised)] px-4 py-2 text-sm transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {picked.length > 0 ? "Add more images" : "Add images"}
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Alt text" htmlFor="upload-alt" className="min-w-48 flex-1">
            <input
              id="upload-alt"
              name="alt"
              placeholder="Ivory duvet on a made bed"
              className="lx-field"
            />
          </Field>

          {allValues.length > 0 ? (
            <Field label="Shows for" htmlFor="upload-option" className="w-44">
              <select id="upload-option" name="optionValueId" className="lx-field">
                <option value="">All variants</option>
                {allValues.map((value) => (
                  <option key={value.id} value={value.id}>
                    {value.optionName}: {value.value}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <button
            type="submit"
            disabled={pending || picked.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {picked.length > 0
              ? `Upload ${picked.length} image${picked.length === 1 ? "" : "s"}`
              : "Upload"}
          </button>
        </div>
      </form>
    </Card>
  );
}


function ImagesTab({ product }: { product: EditorProduct }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    addImageAction.bind(null, product.id),
    null,
  );
  const [busy, startBusy] = useTransition();

  const allValues = product.options.flatMap((o) =>
    o.values.map((v) => ({ ...v, optionName: o.name })),
  );

  return (
    <div className="flex flex-col gap-6">
      <UploadImages product={product} allValues={allValues} />

      <Card className="p-5">
        <h3 className="lx-eyebrow mb-3">Or paste a link</h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          For an image already hosted somewhere. Tie it to an option value and the gallery will
          swap when a shopper picks that value.
        </p>

        <form action={action} className="flex flex-wrap items-end gap-3">
          <Field label="Image URL" htmlFor="url" className="min-w-64 flex-1">
            <input
              id="url"
              name="url"
              type="url"
              placeholder="https://res.cloudinary.com/..."
              className="lx-field"
            />
          </Field>

          <Field label="Alt text" htmlFor="alt" className="min-w-48 flex-1">
            <input id="alt" name="alt" placeholder="Ivory lamp on a side table" className="lx-field" />
          </Field>

          {allValues.length > 0 ? (
            <Field label="Shows for" htmlFor="optionValueId" className="w-44">
              <select id="optionValueId" name="optionValueId" className="lx-field">
                <option value="">All variants</option>
                {allValues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.optionName}: {v.value}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          <button
            type="submit"
            disabled={pending}
            className="rounded-(--radius-card) bg-[var(--accent)] px-5 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
          >
            {pending ? "Adding…" : "Add image"}
          </button>
        </form>

        {state?.message ? (
          <p className={cn("mt-3 text-sm", state.ok ? "text-success" : "text-danger")}>
            {state.message}
          </p>
        ) : null}
      </Card>

      {product.images.length === 0 ? (
        <Card className="p-10 text-center text-sm text-[var(--text-secondary)]">
          No images yet. The first image is used on product cards and social previews.
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {product.images.map((image, index) => {
            const tiedTo = allValues.find((v) => v.id === image.optionValueId);

            return (
              <Card key={image.id} className="overflow-hidden">
                <div className="lx-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.url} alt={image.alt ?? ""} />
                  {index === 0 ? (
                    <span className="absolute left-2 top-2">
                      <Badge tone="accent">Primary</Badge>
                    </span>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 p-3">
                  {allValues.length > 0 ? (
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--text-muted)]">
                        Shows for
                      </span>
                      <span className="flex items-center gap-1.5">
                        {tiedTo?.hexColor ? (
                          <span
                            aria-hidden
                            className="h-4 w-4 shrink-0 rounded-full border border-[var(--border-strong)]"
                            style={{ backgroundColor: tiedTo.hexColor }}
                          />
                        ) : null}
                        <select
                          value={image.optionValueId ?? ""}
                          disabled={busy}
                          onChange={(event) => {
                            const next = event.target.value || null;
                            startBusy(async () => {
                              await setImageOptionValueAction(product.id, image.id, next);
                            });
                          }}
                          className="lx-field w-full py-1.5 text-xs"
                        >
                          <option value="">All variants</option>
                          {allValues.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.optionName}: {v.value}
                            </option>
                          ))}
                        </select>
                      </span>
                    </label>
                  ) : (
                    <p className="text-xs text-[var(--text-muted)]">All variants</p>
                  )}

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={busy || index === 0}
                      onClick={() =>
                        startBusy(async () => {
                          await moveImageAction(product.id, image.id, "up");
                        })
                      }
                      className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-30"
                      aria-label="Move earlier"
                    >
                      <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={busy || index === product.images.length - 1}
                      onClick={() =>
                        startBusy(async () => {
                          await moveImageAction(product.id, image.id, "down");
                        })
                      }
                      className="rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-30"
                      aria-label="Move later"
                    >
                      <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        startBusy(async () => {
                          await deleteImageAction(product.id, image.id);
                        })
                      }
                      className="ml-auto rounded p-1.5 text-[var(--text-secondary)] hover:text-danger"
                      aria-label="Delete image"
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
