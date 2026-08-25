import { db } from "./db";

export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

type SluggableModel = "product" | "category" | "collection";

function findBySlug(model: SluggableModel, slug: string): Promise<{ id: string } | null> {
  const where = { slug };
  const select = { id: true } as const;

  switch (model) {
    case "product":
      return db.product.findUnique({ where, select });
    case "category":
      return db.category.findUnique({ where, select });
    case "collection":
      return db.collection.findUnique({ where, select });
  }
}

/** Appends -2, -3 ... until the slug is free. `ignoreId` allows renames. */
export async function uniqueSlug(
  model: SluggableModel,
  desired: string,
  ignoreId?: string,
): Promise<string> {
  const base = slugify(desired) || "item";
  let candidate = base;
  let n = 1;

  for (;;) {
    const existing = await findBySlug(model, candidate);
    if (!existing || existing.id === ignoreId) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

/** Human-facing order number, e.g. LX-8FK2QW. */
export function generateOrderNumber(): string {
  const alphabet = "ACDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `LX-${out}`;
}

/** Deterministic SKU stem from a product title. */
export function skuFromTitle(title: string): string {
  return (
    slugify(title)
      .split("-")
      .map((w) => w.slice(0, 3).toUpperCase())
      .join("")
      .slice(0, 9) || "SKU"
  );
}
