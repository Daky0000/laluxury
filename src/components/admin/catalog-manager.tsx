"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  deleteCategoryAction,
  deleteCollectionAction,
  saveCategoryAction,
  saveCollectionAction,
} from "@/app/actions/admin/catalog-ops";
import type { AdminState } from "@/app/actions/admin/products";
import { Alert, Badge, Card, Field } from "@/components/ui";
import { Photo } from "@/components/shop/photo";
import { ImageUrlField } from "./image-url-field";

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  parentId: string | null;
  position: number;
  isActive: boolean;
  productCount: number;
};

export type CollectionRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  isFeatured: boolean;
  isActive: boolean;
  position: number;
  productCount: number;
};

const button =
  "inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white disabled:opacity-50";
const ghost =
  "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-subtle)] px-3 py-1.5 text-xs";

// --- Categories -------------------------------------------------------------

function CategoryForm({
  category,
  all,
  onDone,
}: {
  category: CategoryRow | null;
  all: CategoryRow[];
  onDone: () => void;
}) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await saveCategoryAction(category?.id ?? null, prev, formData);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  // A category cannot be filed under itself or under one of its own children.
  const parents = all.filter((c) => c.id !== category?.id && c.parentId !== category?.id);

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Name" htmlFor="cat-name" required>
          <input id="cat-name" name="name" required defaultValue={category?.name ?? ""} className="lx-field" />
        </Field>
        <Field label="Order" htmlFor="cat-position" hint="Lower first.">
          <input
            id="cat-position"
            name="position"
            type="number"
            defaultValue={category?.position ?? all.length + 1}
            className="lx-field"
          />
        </Field>
      </div>

      <Field label="Description" htmlFor="cat-description" hint="Shown under the room card and on the 404 page.">
        <input
          id="cat-description"
          name="description"
          defaultValue={category?.description ?? ""}
          className="lx-field"
        />
      </Field>

      <Field label="Sits inside" htmlFor="cat-parent" hint="Top-level rooms appear in the header and footer.">
        <select id="cat-parent" name="parentId" defaultValue={category?.parentId ?? ""} className="lx-field">
          <option value="">Top level</option>
          {parents.map((parent) => (
            <option key={parent.id} value={parent.id}>
              {parent.name}
            </option>
          ))}
        </select>
      </Field>

      <ImageUrlField name="imageUrl" defaultValue={category?.imageUrl ?? ""} folder="categories" label="Card picture" />

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={category?.isActive ?? true} className="accent-[var(--accent)]" />
        Shown on the storefront
      </label>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {category ? "Save category" : "Add category"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-[var(--text-secondary)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CategoryManager({ categories, canWrite }: { categories: CategoryRow[]; canWrite: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, startBusy] = useTransition();
  const [notice, setNotice] = useState<AdminState | null>(null);

  const byParent = new Map<string | null, CategoryRow[]>();
  for (const category of categories) {
    const list = byParent.get(category.parentId) ?? [];
    list.push(category);
    byParent.set(category.parentId, list);
  }
  const ordered = [
    ...(byParent.get(null) ?? []).flatMap((top) => [top, ...(byParent.get(top.id) ?? [])]),
  ];
  // Anything whose parent is gone still needs to be reachable.
  for (const category of categories) if (!ordered.includes(category)) ordered.push(category);

  function remove(category: CategoryRow) {
    if (!confirm(`Delete "${category.name}"? Its ${category.productCount} products stay, but leave the room.`)) return;
    setNotice(null);
    startBusy(async () => setNotice(await deleteCategoryAction(category.id)));
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Categories</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            The rooms of the shop. Top-level ones make the header, the footer and the room cards.
          </p>
        </div>
        {canWrite && editing !== "new" ? (
          <button type="button" onClick={() => setEditing("new")} className={button}>
            <Plus className="h-4 w-4" aria-hidden />
            Add category
          </button>
        ) : null}
      </div>

      {notice?.message ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}

      {editing === "new" ? (
        <div className="rounded-lg border border-[var(--border-subtle)] p-4">
          <CategoryForm category={null} all={categories} onDone={() => setEditing(null)} />
        </div>
      ) : null}

      {ordered.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No categories yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {ordered.map((category) => (
            <li key={category.id} className="py-3">
              {editing === category.id ? (
                <CategoryForm category={category} all={categories} onDone={() => setEditing(null)} />
              ) : (
                <div className={`flex items-center gap-3 ${category.parentId ? "pl-8" : ""}`}>
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
                    {category.imageUrl ? <Photo src={category.imageUrl} sizes="48px" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/shop?category=${category.slug}`} className="text-sm font-medium hover:underline">
                        {category.name}
                      </Link>
                      <Badge tone={category.isActive ? "success" : "neutral"}>{category.isActive ? "shown" : "hidden"}</Badge>
                      <span className="text-xs text-[var(--text-muted)]">
                        {category.productCount} product{category.productCount === 1 ? "" : "s"} · order {category.position}
                      </span>
                    </span>
                    {category.description ? (
                      <span className="block truncate text-xs text-[var(--text-muted)]">{category.description}</span>
                    ) : null}
                  </span>
                  {canWrite ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => setEditing(category.id)} className={ghost}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(category)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:text-danger disabled:opacity-50"
                        aria-label={`Delete ${category.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </span>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

// --- Collections ------------------------------------------------------------

function CollectionForm({ collection, count, onDone }: { collection: CollectionRow | null; count: number; onDone: () => void }) {
  const [state, action, pending] = useActionState<AdminState | null, FormData>(
    async (prev, formData) => {
      const result = await saveCollectionAction(collection?.id ?? null, prev, formData);
      if (result.ok) onDone();
      return result;
    },
    null,
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      {state?.message && !state.ok ? <Alert tone="danger">{state.message}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <Field label="Name" htmlFor="col-name" required>
          <input id="col-name" name="name" required defaultValue={collection?.name ?? ""} placeholder="New In" className="lx-field" />
        </Field>
        <Field label="Order" htmlFor="col-position">
          <input id="col-position" name="position" type="number" defaultValue={collection?.position ?? count + 1} className="lx-field" />
        </Field>
      </div>

      <Field label="Description" htmlFor="col-description">
        <input id="col-description" name="description" defaultValue={collection?.description ?? ""} className="lx-field" />
      </Field>

      <ImageUrlField name="imageUrl" defaultValue={collection?.imageUrl ?? ""} folder="collections" label="Picture" />

      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={collection?.isActive ?? true} className="accent-[var(--accent)]" />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isFeatured" defaultChecked={collection?.isFeatured ?? false} className="accent-[var(--accent)]" />
          Featured
        </label>
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className={button}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {collection ? "Save collection" : "Add collection"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-[var(--text-secondary)]">
          Cancel
        </button>
      </div>
    </form>
  );
}

export function CollectionManager({ collections, canWrite }: { collections: CollectionRow[]; canWrite: boolean }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [busy, startBusy] = useTransition();
  const [notice, setNotice] = useState<AdminState | null>(null);

  function remove(collection: CollectionRow) {
    if (!confirm(`Delete "${collection.name}"? Its products stay, but leave the collection.`)) return;
    setNotice(null);
    startBusy(async () => setNotice(await deleteCollectionAction(collection.id)));
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Collections</h2>
          <p className="mt-0.5 text-xs text-[var(--text-muted)]">
            Edits that cut across rooms — New In, Best Sellers, a seasonal drop. Reach them at /shop?collection=slug.
          </p>
        </div>
        {canWrite && editing !== "new" ? (
          <button type="button" onClick={() => setEditing("new")} className={button}>
            <Plus className="h-4 w-4" aria-hidden />
            Add collection
          </button>
        ) : null}
      </div>

      {notice?.message ? <Alert tone={notice.ok ? "success" : "danger"}>{notice.message}</Alert> : null}

      {editing === "new" ? (
        <div className="rounded-lg border border-[var(--border-subtle)] p-4">
          <CollectionForm collection={null} count={collections.length} onDone={() => setEditing(null)} />
        </div>
      ) : null}

      {collections.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">No collections yet.</p>
      ) : (
        <ul className="divide-y divide-[var(--border-subtle)]">
          {collections.map((collection) => (
            <li key={collection.id} className="py-3">
              {editing === collection.id ? (
                <CollectionForm collection={collection} count={collections.length} onDone={() => setEditing(null)} />
              ) : (
                <div className="flex items-center gap-3">
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)]">
                    {collection.imageUrl ? <Photo src={collection.imageUrl} sizes="48px" /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/shop?collection=${collection.slug}`} className="text-sm font-medium hover:underline">
                        {collection.name}
                      </Link>
                      <Badge tone={collection.isActive ? "success" : "neutral"}>{collection.isActive ? "active" : "off"}</Badge>
                      {collection.isFeatured ? <Badge tone="accent">featured</Badge> : null}
                      <span className="text-xs text-[var(--text-muted)]">
                        {collection.productCount} product{collection.productCount === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="block font-mono text-xs text-[var(--text-muted)]">{collection.slug}</span>
                  </span>
                  {canWrite ? (
                    <span className="flex shrink-0 items-center gap-2">
                      <button type="button" onClick={() => setEditing(collection.id)} className={ghost}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => remove(collection)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-muted)] hover:text-danger disabled:opacity-50"
                        aria-label={`Delete ${collection.name}`}
                      >
                        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Trash2 className="h-3.5 w-3.5" aria-hidden />}
                      </button>
                    </span>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
