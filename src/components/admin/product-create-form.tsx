"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { Check, Copy, Link as LinkIcon, Loader2, RotateCcw } from "lucide-react";
import { createProductAction, type AdminState } from "@/app/actions/admin/products";
import { Card, Field, Alert } from "@/components/ui";
import { slugify } from "@/lib/utils";

const subscribeNoop = () => () => {};
const getWindowOrigin = () => window.location.origin;
const getServerOrigin = () => "";

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

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [isSlugCustomized, setIsSlugCustomized] = useState(false);
  const [copied, setCopied] = useState(false);
  const origin = useSyncExternalStore(subscribeNoop, getWindowOrigin, getServerOrigin);


  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTitle(val);
    if (!isSlugCustomized) {
      setSlug(slugify(val));
    }
  };

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsSlugCustomized(true);
    setSlug(slugify(e.target.value));
  };

  const resetSlugToTitle = () => {
    setIsSlugCustomized(false);
    setSlug(slugify(title));
  };

  const currentSlug = slug || (title ? slugify(title) : "product-url-slug");
  const fullPermalink = `${origin || "https://laluxurys.com"}/product/${currentSlug}`;

  const copyPermalink = async () => {
    try {
      await navigator.clipboard.writeText(fullPermalink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      // Fallback
      setCopied(false);
    }
  };

  return (
    <form action={action} className="flex flex-col gap-6">
      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <Card className="flex flex-col gap-4 p-5">
        <Field label="Product name" htmlFor="title" required>
          <input
            id="title"
            name="title"
            value={title}
            onChange={handleTitleChange}
            required
            autoFocus
            placeholder="Adinkra Ceramic Table Lamp"
            className="lx-field"
          />
        </Field>

        {/* Live Permalink & Handle */}
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-sunken)] p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              <LinkIcon className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
              <span>Product Permalink</span>
            </div>
            <button
              type="button"
              onClick={copyPermalink}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-base)] transition-colors shadow-2xs"
              title="Copy full product link to clipboard"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden />
                  <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-[var(--text-secondary)]" aria-hidden />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-xs sm:text-sm font-mono text-[var(--text-primary)] bg-[var(--surface-raised)] rounded px-3 py-2 border border-[var(--border-subtle)] break-all select-all">
            <span className="text-[var(--text-muted)]">{origin || "https://laluxurys.com"}/product/</span>
            <span className="font-semibold text-[var(--accent)]">{slug || (title ? slugify(title) : "your-product-name")}</span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)]/60 text-xs">
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <span className="text-[var(--text-muted)] shrink-0">Handle:</span>
              <input
                id="slug"
                name="slug"
                value={slug}
                onChange={handleSlugChange}
                placeholder={title ? slugify(title) : "product-slug"}
                className="lx-field py-1 text-xs font-mono flex-1 h-7"
                spellCheck={false}
              />
            </div>
            {isSlugCustomized && (
              <button
                type="button"
                onClick={resetSlugToTitle}
                className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] underline"
              >
                <RotateCcw className="h-3 w-3" />
                Reset to product name
              </button>
            )}
          </div>
        </div>


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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Was price (GHS)"
            htmlFor="compareAtPrice"
            hint="Optional. Struck through beside the price to show a saving."
          >
            <input
              id="compareAtPrice"
              name="compareAtPrice"
              type="number"
              step="0.01"
              min="0"
              placeholder="1200.00"
              className="lx-field"
            />
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

      <Card className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="lx-eyebrow">Pre-Order &amp; Bespoke Sourcing</h3>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Tick if this piece is not yet in stock and will be ordered or handcrafted for customers upon request.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" name="isPreorder" className="h-4 w-4 accent-[var(--accent)]" />
            Available on Pre-Order
          </label>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Estimated lead time" htmlFor="preorderLeadTime">
            <input
              id="preorderLeadTime"
              name="preorderLeadTime"
              defaultValue="4–6 weeks"
              placeholder="4–6 weeks"
              className="lx-field"
            />
          </Field>

          <Field label="Reservation deposit (%)" htmlFor="preorderDepositPercent">
            <input
              id="preorderDepositPercent"
              name="preorderDepositPercent"
              type="number"
              min={10}
              max={100}
              defaultValue={50}
              className="lx-field"
            />
          </Field>
        </div>

        <Field label="Pre-Order concierge note" htmlFor="preorderNote">
          <input
            id="preorderNote"
            name="preorderNote"
            placeholder="Handcrafted to order and delivered by our Accra concierge."
            className="lx-field"
          />
        </Field>
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
