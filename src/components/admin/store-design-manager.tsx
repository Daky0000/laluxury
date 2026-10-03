"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { Loader2, Pencil, Check, Image as ImageIcon } from "lucide-react";
import { saveCategoryAction } from "@/app/actions/admin/catalog-ops";
import type { AdminState } from "@/app/actions/admin/products";
import { Alert, Badge, Card, Field } from "@/components/ui";
import { ImageUrlField } from "./image-url-field";

export type CategoryDesignItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  position: number;
  isActive: boolean;
  productCount: number;
};

export function StoreDesignManager({
  categories,
  canWrite,
}: {
  categories: CategoryDesignItem[];
  canWrite: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);

  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-medium">Storefront Categories &amp; Backgrounds</h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Click on any category card below to customize its background image and title.
          </p>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {activeCategories.map((cat) => (
          <div key={cat.id} className="flex flex-col">
            {/* Visual Card Preview */}
            <div className="relative aspect-4/5 w-full overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface-sunken)] shadow-sm group">
              {cat.imageUrl ? (
                <Image
                  src={cat.imageUrl}
                  alt={cat.name}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[#2B2724] text-stone-400">
                  <ImageIcon className="h-10 w-10 opacity-50" />
                </div>
              )}

              {/* Dark luxury overlay matching mobile and storefront */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/20" />

              <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col justify-end">
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/70 font-medium">
                  Position #{cat.position} · {cat.productCount} pieces
                </span>
                <h3 className="font-serif text-2xl font-light text-white tracking-wide mt-1">
                  {cat.name}
                </h3>
                {cat.description ? (
                  <p className="text-xs text-white/80 line-clamp-2 mt-1 font-light">
                    {cat.description}
                  </p>
                ) : null}

                {canWrite ? (
                  <button
                    type="button"
                    onClick={() => setEditingId(editingId === cat.id ? null : cat.id)}
                    className="mt-3.5 inline-flex items-center justify-center gap-1.5 rounded-lg bg-white/20 backdrop-blur-md px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    {editingId === cat.id ? "Close Editor" : "Change Background & Details"}
                  </button>
                ) : null}
              </div>
            </div>

            {/* In-place editor modal / form */}
            {editingId === cat.id && (
              <Card className="mt-3 p-4 border-t-2 border-t-[var(--accent)]">
                <EditCategoryForm
                  category={cat}
                  onDone={() => setEditingId(null)}
                />
              </Card>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function EditCategoryForm({
  category,
  onDone,
}: {
  category: CategoryDesignItem;
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await saveCategoryAction(category.id, prev, formData);
      if (result.ok) onDone();
      return result;
    },
    null
  );

  return (
    <form action={action} className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)]">
          Edit {category.name}
        </span>
        <button
          type="button"
          onClick={onDone}
          className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          Cancel
        </button>
      </div>

      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <Field label="Category Name" htmlFor={`name-${category.id}`} required>
        <input
          id={`name-${category.id}`}
          name="name"
          defaultValue={category.name}
          required
          className="lx-field text-sm py-1.5"
        />
      </Field>

      <ImageUrlField
        name="imageUrl"
        defaultValue={category.imageUrl ?? ""}
        folder="categories"
        label="Background Card Image"
      />

      <Field label="Display Order" htmlFor={`pos-${category.id}`} hint="1 = first in carousel">
        <input
          id={`pos-${category.id}`}
          name="position"
          type="number"
          defaultValue={category.position}
          className="lx-field text-sm py-1.5"
        />
      </Field>

      <Field label="Description" htmlFor={`desc-${category.id}`}>
        <textarea
          id={`desc-${category.id}`}
          name="description"
          rows={2}
          defaultValue={category.description ?? ""}
          className="lx-field text-sm"
        />
      </Field>

      <input type="hidden" name="isActive" value="on" />

      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
          Save Changes
        </button>
      </div>
    </form>
  );
}
