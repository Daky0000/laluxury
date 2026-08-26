"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { createProductAction, type AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert } from "@/components/ui";

type Option = { id: string; name: string };

export function ProductCreateForm({
  categories,
  collections,
}: {
  categories: Option[];
  collections: Option[];
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    createProductAction,
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <Card className="flex flex-col gap-4 p-5">
        <Field label="Product name" htmlFor="title" required>
          <input
            id="title"
            name="title"
            required
            autoFocus
            placeholder="Adinkra Ceramic Table Lamp"
            className="lx-field"
          />
        </Field>

        <Field label="Short description" htmlFor="shortDescription" hint="One line, shown on cards.">
          <input
            id="shortDescription"
            name="shortDescription"
            placeholder="Hand-thrown stoneware with a linen shade."
            className="lx-field"
          />
        </Field>

        <Field label="Description" htmlFor="description">
          <textarea id="description" name="description" rows={5} className="lx-field resize-y" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Price (GHS)" htmlFor="price" required>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              required
              placeholder="890.00"
              className="lx-field"
            />
          </Field>

          <Field label="Opening stock" htmlFor="stock">
            <input
              id="stock"
              name="stock"
              type="number"
              min="0"
              defaultValue={0}
              className="lx-field"
            />
          </Field>

          <Field label="SKU" htmlFor="sku" hint="Auto-generated if blank.">
            <input id="sku" name="sku" placeholder="ADCETALA-01" className="lx-field" />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Brand" htmlFor="brand">
            <input id="brand" name="brand" className="lx-field" />
          </Field>
          <Field label="Material" htmlFor="material">
            <input id="material" name="material" placeholder="Stoneware, linen" className="lx-field" />
          </Field>
          <Field label="Care" htmlFor="care">
            <input id="care" name="care" placeholder="Wipe clean" className="lx-field" />
          </Field>
        </div>

        <Field label="Tags" htmlFor="tags" hint="Comma separated. Used by search and filters.">
          <input id="tags" name="tags" placeholder="handmade, ceramic, lamp" className="lx-field" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <fieldset>
            <legend className="lx-eyebrow mb-2">Categories</legend>
            <div className="flex flex-col gap-1.5">
              {categories.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No categories yet.</p>
              ) : (
                categories.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="categoryIds"
                      value={c.id}
                      className="accent-[var(--accent)]"
                    />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend className="lx-eyebrow mb-2">Collections</legend>
            <div className="flex flex-col gap-1.5">
              {collections.length === 0 ? (
                <p className="text-sm text-[var(--text-muted)]">No collections yet.</p>
              ) : (
                collections.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="collectionIds"
                      value={c.id}
                      className="accent-[var(--accent)]"
                    />
                    {c.name}
                  </label>
                ))
              )}
            </div>
          </fieldset>
        </div>
      </Card>

      <Card className="flex flex-wrap items-end justify-between gap-4 p-5">
        <Field label="Status" htmlFor="status" hint="Drafts are invisible on the storefront.">
          <select id="status" name="status" defaultValue="DRAFT" className="lx-field w-44">
            <option value="DRAFT">Draft</option>
            <option value="ACTIVE">Active</option>
          </select>
        </Field>

        <label className="flex items-center gap-2 pb-2.5 text-sm">
          <input type="checkbox" name="isFeatured" className="accent-[var(--accent)]" />
          Feature on the homepage
        </label>

        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-(--radius-card) bg-[var(--accent)] px-6 py-2.5 text-sm text-[var(--accent-contrast)] disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          Create product
        </button>
      </Card>
    </form>
  );
}
