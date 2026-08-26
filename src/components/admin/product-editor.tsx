"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Trash2, ArrowUp, ArrowDown, ExternalLink, Plus } from "lucide-react";
import {
  updateProductAction,
  updateVariantsAction,
  addOptionAction,
  deleteOptionAction,
  addImageAction,
  deleteImageAction,
  moveImageAction,
  deleteProductAction,
  type AdminState,
} from "@/app/actions/admin/products";
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
          <ul className="mb-5 flex flex-col gap-2">
            {product.options.map((option) => (
              <li
                key={option.id}
                className="flex items-center justify-between gap-4 rounded-(--radius-card) border border-[var(--border-subtle)] px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{option.name}</p>
                  <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                    {option.values.map((v) => v.value).join(", ")}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={removing}
                  onClick={() => {
                    if (!confirm(`Remove the ${option.name} option and rebuild variants?`)) return;
                    startRemove(async () => {
                      await deleteOptionAction(product.id, option.id);
                    });
                  }}
                  className="text-[var(--text-secondary)] hover:text-danger"
                  aria-label={`Remove ${option.name}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
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
      <Card className="p-5">
        <h3 className="lx-eyebrow mb-3">Add an image</h3>
        <p className="mb-4 text-sm text-[var(--text-secondary)]">
          Paste a hosted image URL. Tie it to an option value and the gallery will swap when a
          shopper picks that value.
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
                  {tiedTo ? (
                    <p className="text-xs text-[var(--text-secondary)]">
                      {tiedTo.optionName}: {tiedTo.value}
                    </p>
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
