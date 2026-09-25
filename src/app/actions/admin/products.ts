"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/auth";
import { uniqueSlug, skuFromTitle, slugify } from "@/lib/slug";
import { buildSearchText, refreshPriceRange } from "@/lib/catalog";
import { toMinorUnits } from "@/lib/money";
import { ensureInventoryItem } from "@/lib/inventory";
import { recordAudit } from "@/lib/audit";

export type AdminState = { ok: boolean; message?: string; fieldErrors?: Record<string, string> };

function fail(message: string): AdminState {
  return { ok: false, message };
}

/**
 * Clears every cached view a product appears in, so an edit in the admin is
 * live on the storefront immediately rather than when the page's own
 * revalidate window happens to lapse.
 */
function revalidateProduct(id?: string) {
  revalidatePath("/admin/products");
  revalidatePath("/admin/preorders");
  if (id) revalidatePath(`/admin/products/${id}`);
  revalidatePath("/shop");
  revalidatePath("/pre-order");
  revalidatePath("/");
  // Every product page at once: the slug may itself have just changed.
  revalidatePath("/product/[slug]", "page");
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

const productSchema = z.object({
  title: z.string().min(1, "Give the product a name."),
  shortDescription: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  brand: z.string().optional(),
  material: z.string().optional(),
  care: z.string().optional(),
  tags: z.string().optional(),
  isFeatured: z.boolean().optional(),
  isPreorder: z.boolean().optional(),
  preorderLeadTime: z.string().optional(),
  preorderDepositPercent: z.number().int().min(10).max(100).nullable().optional(),
  preorderNote: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
  categoryIds: z.array(z.string()).optional(),
  collectionIds: z.array(z.string()).optional(),
  /** The URL handle. Blank keeps the current one; a new title never changes an edited one. */
  slug: z.string().optional(),
  /** A "was" price for every variant that has none of its own, in cedis. */
  compareAtPrice: z.string().optional(),
});

function parseProductForm(formData: FormData) {
  const rawDeposit = String(formData.get("preorderDepositPercent") ?? "").trim();
  return productSchema.safeParse({
    slug: formData.get("slug") || undefined,
    compareAtPrice: formData.get("compareAtPrice") || undefined,
    title: formData.get("title"),
    shortDescription: formData.get("shortDescription") || undefined,
    description: formData.get("description") || undefined,
    status: formData.get("status") || "DRAFT",
    brand: formData.get("brand") || undefined,
    material: formData.get("material") || undefined,
    care: formData.get("care") || undefined,
    tags: formData.get("tags") || undefined,
    isFeatured: formData.get("isFeatured") === "on",
    isPreorder: formData.get("isPreorder") === "on",
    preorderLeadTime: formData.get("preorderLeadTime") || undefined,
    preorderDepositPercent: rawDeposit ? Number(rawDeposit) : null,
    preorderNote: formData.get("preorderNote") || undefined,
    metaTitle: formData.get("metaTitle") || undefined,
    metaDescription: formData.get("metaDescription") || undefined,
    categoryIds: formData.getAll("categoryIds").map(String).filter(Boolean),
    collectionIds: formData.getAll("collectionIds").map(String).filter(Boolean),
  });
}

function splitTags(raw?: string): string[] {
  return (raw ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Creates a product plus one default variant, so it is immediately sellable. */
export async function createProductAction(
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("products:write");
  const parsed = parseProductForm(formData);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");

  const data = parsed.data;
  const priceRaw = Number(formData.get("price"));
  if (!Number.isFinite(priceRaw) || priceRaw < 0) return fail("Enter a valid price.");

  const price = toMinorUnits(priceRaw);
  const tags = splitTags(data.tags);
  const slug = await uniqueSlug("product", data.title);

  // A "was" price is optional, and only means anything above the real one.
  let compareAtPrice: number | null = null;
  if (data.compareAtPrice) {
    try {
      compareAtPrice = toMinorUnits(data.compareAtPrice);
    } catch {
      return fail("The was-price is not a number.");
    }
    if (compareAtPrice <= price) {
      return fail("The was-price has to be higher than the price you are selling at.");
    }
  }

  let sku = String(formData.get("sku") || "").trim() || `${skuFromTitle(data.title)}-01`;
  if (await db.variant.findUnique({ where: { sku }, select: { id: true } })) {
    sku = `${sku}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  const categorySet = new Set(data.categoryIds ?? []);
  if (data.isPreorder) {
    const preorderCat = await db.category.findUnique({
      where: { slug: "pre-order" },
      select: { id: true },
    });
    if (preorderCat) categorySet.add(preorderCat.id);
  }

  const product = await db.product.create({
    data: {
      title: data.title,
      slug,
      shortDescription: data.shortDescription ?? null,
      description: data.description ?? null,
      status: data.status,
      brand: data.brand ?? null,
      material: data.material ?? null,
      care: data.care ?? null,
      tags,
      isFeatured: Boolean(data.isFeatured),
      isPreorder: Boolean(data.isPreorder),
      preorderLeadTime: data.isPreorder ? (data.preorderLeadTime ?? "4–6 weeks") : null,
      preorderDepositPercent: data.isPreorder ? (data.preorderDepositPercent ?? 50) : null,
      preorderNote: data.isPreorder ? (data.preorderNote ?? null) : null,
      metaTitle: data.metaTitle ?? null,
      metaDescription: data.metaDescription ?? null,
      publishedAt: data.status === "ACTIVE" ? new Date() : null,
      minPrice: price,
      maxPrice: price,
      compareAtPrice,
      searchText: buildSearchText({
        title: data.title,
        tags,
        brand: data.brand,
        material: data.material,
        shortDescription: data.shortDescription,
      }),
      variants: {
        create: {
          title: "Default",
          sku,
          price,
          inventory: {
            create: {
              onHand: Number(formData.get("stock")) || 0,
              allowBackorder: Boolean(data.isPreorder),
            },
          },
        },
      },
      categories: {
        create: [...categorySet].map((categoryId) => ({ categoryId })),
      },
      collections: {
        create: (data.collectionIds ?? []).map((collectionId) => ({ collectionId })),
      },
    },
  });

  await recordAudit({
    actorId: actor.id,
    action: "product.create",
    entity: "Product",
    entityId: product.id,
    after: { title: product.title, slug, price, isPreorder: product.isPreorder },
  });

  revalidateProduct(product.id);
  redirect(`/admin/products/${product.id}`);
}

export async function updateProductAction(
  productId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("products:write");
  const parsed = parseProductForm(formData);
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the form.");

  const existing = await db.product.findUnique({ where: { id: productId } });
  if (!existing) return fail("That product no longer exists.");

  const data = parsed.data;
  const tags = splitTags(data.tags);

  const typedSlug = data.slug?.trim() ? slugify(data.slug) : "";
  const slug = typedSlug
    ? typedSlug === existing.slug
      ? existing.slug
      : await uniqueSlug("product", typedSlug, productId)
    : data.title !== existing.title
      ? await uniqueSlug("product", data.title, productId)
      : existing.slug;

  let compareAtPrice: number | null;
  try {
    compareAtPrice = data.compareAtPrice ? toMinorUnits(data.compareAtPrice) : null;
  } catch {
    return fail("The was-price is not a number.");
  }
  if (compareAtPrice !== null && compareAtPrice < 0) return fail("The was-price cannot be negative.");

  const categorySet = new Set(data.categoryIds ?? []);
  if (data.isPreorder) {
    const preorderCat = await db.category.findUnique({
      where: { slug: "pre-order" },
      select: { id: true },
    });
    if (preorderCat) categorySet.add(preorderCat.id);
  }

  await db.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: productId },
      data: {
        title: data.title,
        slug,
        compareAtPrice,
        shortDescription: data.shortDescription ?? null,
        description: data.description ?? null,
        status: data.status,
        brand: data.brand ?? null,
        material: data.material ?? null,
        care: data.care ?? null,
        tags,
        isFeatured: Boolean(data.isFeatured),
        isPreorder: Boolean(data.isPreorder),
        preorderLeadTime: data.isPreorder ? (data.preorderLeadTime ?? "4–6 weeks") : null,
        preorderDepositPercent: data.isPreorder ? (data.preorderDepositPercent ?? 50) : null,
        preorderNote: data.isPreorder ? (data.preorderNote ?? null) : null,
        metaTitle: data.metaTitle ?? null,
        metaDescription: data.metaDescription ?? null,
        publishedAt:
          data.status === "ACTIVE" && !existing.publishedAt ? new Date() : existing.publishedAt,
        searchText: buildSearchText({
          title: data.title,
          tags,
          brand: data.brand,
          material: data.material,
          shortDescription: data.shortDescription,
        }),
      },
    });

    // When a product is marked Pre-Order, allow backorders on all its variants
    // so customers can pre-order even when onHand stock is 0.
    if (data.isPreorder) {
      await tx.inventoryItem.updateMany({
        where: { variant: { productId } },
        data: { allowBackorder: true },
      });
    }

    // Membership is small, so replace wholesale rather than diffing.
    await tx.productCategory.deleteMany({ where: { productId } });
    if (categorySet.size > 0) {
      await tx.productCategory.createMany({
        data: [...categorySet].map((categoryId) => ({ productId, categoryId })),
      });
    }

    await tx.productCollection.deleteMany({ where: { productId } });
    if (data.collectionIds?.length) {
      await tx.productCollection.createMany({
        data: data.collectionIds.map((collectionId) => ({ productId, collectionId })),
      });
    }
  });

  await recordAudit({
    actorId: actor.id,
    action: "product.update",
    entity: "Product",
    entityId: productId,
    before: { title: existing.title, status: existing.status, isPreorder: existing.isPreorder },
    after: { title: data.title, status: data.status, isPreorder: Boolean(data.isPreorder) },
  });

  revalidateProduct(productId);
  return { ok: true, message: "Saved." };
}

export async function deleteProductAction(productId: string): Promise<AdminState> {
  const actor = await requirePermission("products:write");

  const sold = await db.orderItem.count({ where: { productId } });
  if (sold > 0) {
    // Deleting would orphan order history; archive instead.
    await db.product.update({ where: { id: productId }, data: { status: "ARCHIVED" } });
    await recordAudit({
      actorId: actor.id,
      action: "product.archive",
      entity: "Product",
      entityId: productId,
    });
    revalidateProduct(productId);
    return {
      ok: true,
      message: "This product has sales history, so it was archived rather than deleted.",
    };
  }

  await db.product.delete({ where: { id: productId } });
  await recordAudit({
    actorId: actor.id,
    action: "product.delete",
    entity: "Product",
    entityId: productId,
  });

  revalidateProduct();
  redirect("/admin/products");
}

// ---------------------------------------------------------------------------
// Options & variants
// ---------------------------------------------------------------------------

/**
 * Adds an option (e.g. Colour) with its values, then generates every missing
 * variant combination so the merchant does not hand-build a matrix.
 */
export async function addOptionAction(
  productId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  await requirePermission("products:write");

  const name = String(formData.get("optionName") || "").trim();
  const values = String(formData.get("optionValues") || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

  if (!name) return fail("Name the option, e.g. Colour.");
  if (values.length === 0) return fail("Add at least one value.");

  const existing = await db.productOption.findUnique({
    where: { productId_name: { productId, name } },
  });
  if (existing) return fail(`This product already has an option called ${name}.`);

  const optionCount = await db.productOption.count({ where: { productId } });

  await db.productOption.create({
    data: {
      productId,
      name,
      position: optionCount,
      values: {
        create: values.map((value, i) => ({ value, position: i })),
      },
    },
  });

  await regenerateVariants(productId);
  revalidateProduct(productId);
  return { ok: true, message: `Added ${name} with ${values.length} values.` };
}

export async function deleteOptionAction(
  productId: string,
  optionId: string,
): Promise<AdminState> {
  await requirePermission("products:write");

  await db.productOption.delete({ where: { id: optionId } });
  await regenerateVariants(productId);

  revalidateProduct(productId);
  return { ok: true, message: "Option removed." };
}

/**
 * One row of an option's value list, as the editor submits it.
 *
 * `id` present means an existing value being edited; absent means a new one.
 * Editing rather than replacing matters: the id is what variants, and the
 * images pinned to a colour, are attached to. Retyping a value keeps both.
 *
 * `value` is free text and is stored exactly as typed. Sizes here are things
 * like `3ft` and `2m · single or 2-in-one`, which any attempt to read as a
 * number would flatten to `3` and `2`.
 */
const optionValueRowSchema = z.object({
  id: z.string().optional(),
  value: z.string().trim().min(1),
  /** `#rgb` or `#rrggbb`; null for an option that is not a colour. */
  hex: z
    .string()
    .trim()
    .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a colour like #8B7355.")
    .nullable(),
});

export async function updateOptionAction(
  productId: string,
  optionId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  await requirePermission("products:write");

  const name = String(formData.get("optionName") || "").trim();
  if (!name) return fail("Name the option, e.g. Colour.");

  let rows: z.infer<typeof optionValueRowSchema>[];
  try {
    rows = z.array(optionValueRowSchema).min(1).parse(JSON.parse(String(formData.get("values"))));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return fail(error.issues[0]?.message ?? "Check the values and try again.");
    }
    return fail("Add at least one value.");
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const key = row.value.toLowerCase();
    if (seen.has(key)) return fail(`There are two values called ${row.value}.`);
    seen.add(key);
  }

  const option = await db.productOption.findFirst({
    where: { id: optionId, productId },
    include: { values: { select: { id: true } } },
  });
  if (!option) return fail("That option no longer exists.");

  if (name !== option.name) {
    const clash = await db.productOption.findUnique({
      where: { productId_name: { productId, name } },
      select: { id: true },
    });
    if (clash) return fail(`This product already has an option called ${name}.`);
  }

  // An id is only an edit if it is one of this option's own values. Anything
  // else — a stale row, an id pasted from another product — is created fresh
  // rather than used to reach across into a record this form does not own.
  const ownIds = new Set(option.values.map((v) => v.id));
  const edits = rows.map((row) => ({
    ...row,
    id: row.id && ownIds.has(row.id) ? row.id : undefined,
  }));

  const keptIds = new Set(edits.map((row) => row.id).filter(Boolean) as string[]);
  const dropped = option.values.filter((v) => !keptIds.has(v.id)).map((v) => v.id);

  await db.$transaction(async (tx) => {
    await tx.productOption.update({ where: { id: optionId }, data: { name } });

    // Deleting a value cascades to the variant links that used it, leaving
    // those variants to be cleaned up by the regeneration below.
    if (dropped.length > 0) {
      await tx.productOptionValue.deleteMany({ where: { id: { in: dropped } } });
    }

    for (const [position, row] of edits.entries()) {
      if (row.id) {
        await tx.productOptionValue.update({
          where: { id: row.id },
          data: { value: row.value, hexColor: row.hex, position },
        });
      } else {
        await tx.productOptionValue.create({
          data: { optionId, value: row.value, hexColor: row.hex, position },
        });
      }
    }
  });

  await regenerateVariants(productId);
  // Variant titles are stored, so renaming a value leaves them stale.
  await refreshVariantTitles(productId);

  revalidateProduct(productId);
  return { ok: true, message: `Saved ${name}.` };
}

/**
 * Points an image at an option value, or at nothing.
 *
 * An image tied to a value is shown when a shopper picks it, and takes over as
 * the main image; one tied to nothing shows for every variant.
 */
export async function setImageOptionValueAction(
  productId: string,
  imageId: string,
  optionValueId: string | null,
): Promise<AdminState> {
  await requirePermission("products:write");

  // Confirm the value belongs to this product, so an id from another product
  // cannot be pasted in to hide an image on every variant.
  if (optionValueId) {
    const value = await db.productOptionValue.findFirst({
      where: { id: optionValueId, option: { productId } },
      select: { id: true },
    });
    if (!value) return fail("That option value is not on this product.");
  }

  await db.productImage.updateMany({
    where: { id: imageId, productId },
    data: { optionValueId },
  });

  revalidateProduct(productId);
  return { ok: true };
}

/**
 * Rewrites every variant title from the option values it actually carries.
 *
 * The title is a stored label rather than a computed one, so it survives an
 * option being deleted — but it also means renaming a value leaves every
 * variant still spelling the old one.
 */
async function refreshVariantTitles(productId: string): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      options: { orderBy: { position: "asc" }, select: { id: true } },
      variants: {
        include: { optionValues: { include: { optionValue: true } } },
      },
    },
  });
  if (!product) return;

  const order = new Map(product.options.map((option, i) => [option.id, i]));

  for (const variant of product.variants) {
    const title =
      variant.optionValues
        .map((ov) => ov.optionValue)
        .sort((a, b) => (order.get(a.optionId) ?? 0) - (order.get(b.optionId) ?? 0))
        .map((value) => value.value)
        .join(" / ") || "Default";

    if (title !== variant.title) {
      await db.variant.update({ where: { id: variant.id }, data: { title } });
    }
  }
}

/**
 * Builds the cartesian product of all option values and creates any variant
 * that does not exist yet. Existing variants keep their price and stock.
 */
async function regenerateVariants(productId: string): Promise<void> {
  const product = await db.product.findUnique({
    where: { id: productId },
    include: {
      options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } },
      variants: { include: { optionValues: true } },
    },
  });
  if (!product) return;

  if (product.options.length === 0) {
    // No options: collapse to a single default variant.
    if (product.variants.length === 0) {
      const variant = await db.variant.create({
        data: {
          productId,
          title: "Default",
          sku: `${skuFromTitle(product.title)}-01`,
          price: product.minPrice || 0,
        },
      });
      await ensureInventoryItem(variant.id);
    }
    await refreshPriceRange(productId);
    return;
  }

  // [[ivory, clay], [small, large]] -> every pairing
  const combos = product.options.reduce<{ id: string; value: string }[][]>(
    (acc, option) =>
      acc.flatMap((partial) => option.values.map((v) => [...partial, { id: v.id, value: v.value }])),
    [[]],
  );

  const existingKeys = new Set(
    product.variants.map((v) =>
      v.optionValues
        .map((ov) => ov.optionValueId)
        .sort()
        .join("|"),
    ),
  );

  const basePrice = product.minPrice || 0;
  const stem = skuFromTitle(product.title);

  for (const [index, combo] of combos.entries()) {
    const key = combo
      .map((c) => c.id)
      .sort()
      .join("|");
    if (existingKeys.has(key)) continue;

    let sku = `${stem}-${combo.map((c) => c.value.slice(0, 3).toUpperCase()).join("")}`;
    if (await db.variant.findUnique({ where: { sku }, select: { id: true } })) {
      sku = `${sku}-${index + 1}`;
    }

    const variant = await db.variant.create({
      data: {
        productId,
        title: combo.map((c) => c.value).join(" / "),
        sku,
        price: basePrice,
        position: index,
        optionValues: {
          create: combo.map((c) => ({ optionValueId: c.id })),
        },
      },
    });
    await ensureInventoryItem(variant.id);
  }

  // Drop variants whose option values no longer exist.
  const validKeys = new Set(
    combos.map((combo) =>
      combo
        .map((c) => c.id)
        .sort()
        .join("|"),
    ),
  );
  for (const variant of product.variants) {
    const key = variant.optionValues
      .map((ov) => ov.optionValueId)
      .sort()
      .join("|");
    if (!validKeys.has(key)) {
      const sold = await db.orderItem.count({ where: { variantId: variant.id } });
      if (sold === 0) await db.variant.delete({ where: { id: variant.id } });
      else await db.variant.update({ where: { id: variant.id }, data: { isActive: false } });
    }
  }

  await refreshPriceRange(productId);
}

const variantSchema = z.object({
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable(),
  costPrice: z.number().min(0).nullable(),
  sku: z.string().min(1),
  barcode: z.string().nullable(),
  weightGrams: z.number().min(0).nullable(),
  isActive: z.boolean(),
});

/** Saves the whole variant table in one submit. */
export async function updateVariantsAction(
  productId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  const actor = await requirePermission("products:write");

  const variants = await db.variant.findMany({ where: { productId } });
  const problems: string[] = [];

  for (const variant of variants) {
    const price = Number(formData.get(`price_${variant.id}`));
    const compareAt = String(formData.get(`compareAt_${variant.id}`) ?? "").trim();
    const cost = String(formData.get(`cost_${variant.id}`) ?? "").trim();
    const sku = String(formData.get(`sku_${variant.id}`) ?? "").trim();
    const barcode = String(formData.get(`barcode_${variant.id}`) ?? "").trim();
    const weight = String(formData.get(`weight_${variant.id}`) ?? "").trim();
    const isActive = formData.get(`active_${variant.id}`) === "on";

    const parsed = variantSchema.safeParse({
      price: Number.isFinite(price) ? toMinorUnits(price) : -1,
      compareAtPrice: compareAt ? toMinorUnits(Number(compareAt)) : null,
      costPrice: cost ? toMinorUnits(Number(cost)) : null,
      sku,
      barcode: barcode || null,
      weightGrams: weight ? Number(weight) : null,
      isActive,
    });

    if (!parsed.success) {
      problems.push(`${variant.sku}: check the price and SKU.`);
      continue;
    }

    // SKU is globally unique; catch a clash before the DB throws.
    if (sku !== variant.sku) {
      const clash = await db.variant.findUnique({ where: { sku }, select: { id: true } });
      if (clash && clash.id !== variant.id) {
        problems.push(`SKU ${sku} is already used by another variant.`);
        continue;
      }
    }

    await db.variant.update({
      where: { id: variant.id },
      data: parsed.data,
    });
  }

  await refreshPriceRange(productId);

  await recordAudit({
    actorId: actor.id,
    action: "variant.bulk_update",
    entity: "Product",
    entityId: productId,
  });

  revalidateProduct(productId);

  if (problems.length) return { ok: false, message: problems.join(" ") };
  return { ok: true, message: "Variants saved." };
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export async function addImageAction(
  productId: string,
  _prev: AdminState | null,
  formData: FormData,
): Promise<AdminState> {
  await requirePermission("products:write");

  const url = String(formData.get("url") || "").trim();
  if (!url) return fail("Paste an image URL.");
  if (!/^https?:\/\//.test(url)) return fail("The URL must start with http or https.");

  const count = await db.productImage.count({ where: { productId } });
  const optionValueId = String(formData.get("optionValueId") || "").trim();

  await db.productImage.create({
    data: {
      productId,
      url,
      alt: String(formData.get("alt") || "").trim() || null,
      position: count,
      optionValueId: optionValueId || null,
    },
  });

  revalidateProduct(productId);
  return { ok: true, message: "Image added." };
}

export async function deleteImageAction(
  productId: string,
  imageId: string,
): Promise<AdminState> {
  await requirePermission("products:write");
  await db.productImage.delete({ where: { id: imageId } });
  revalidateProduct(productId);
  return { ok: true };
}

export async function moveImageAction(
  productId: string,
  imageId: string,
  direction: "up" | "down",
): Promise<AdminState> {
  await requirePermission("products:write");

  const images = await db.productImage.findMany({
    where: { productId },
    orderBy: { position: "asc" },
  });

  const index = images.findIndex((i) => i.id === imageId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= images.length) return { ok: true };

  await db.$transaction([
    db.productImage.update({ where: { id: images[index].id }, data: { position: swapWith } }),
    db.productImage.update({ where: { id: images[swapWith].id }, data: { position: index } }),
  ]);

  revalidateProduct(productId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Bulk
// ---------------------------------------------------------------------------

export async function bulkProductAction(
  productIds: string[],
  operation: "publish" | "draft" | "archive" | "feature" | "unfeature" | "delete",
): Promise<AdminState> {
  const actor = await requirePermission("products:write");
  if (productIds.length === 0) return fail("Select at least one product.");

  // Deleting follows the single-product rule: anything with sales history is
  // archived instead, so an order line never points at nothing.
  if (operation === "delete") {
    const sold = await db.orderItem.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true },
      distinct: ["productId"],
    });
    const keep = new Set(sold.map((row) => row.productId).filter((id): id is string => id !== null));
    const removable = productIds.filter((id) => !keep.has(id));

    const [archived, deleted] = await db.$transaction([
      db.product.updateMany({
        where: { id: { in: [...keep] } },
        data: { status: "ARCHIVED" },
      }),
      db.product.deleteMany({ where: { id: { in: removable } } }),
    ]);

    await recordAudit({
      actorId: actor.id,
      action: "product.bulk_delete",
      entity: "Product",
      after: { deleted: deleted.count, archived: archived.count, productIds },
    });

    revalidateProduct();
    const parts = [];
    if (deleted.count) parts.push(`${deleted.count} deleted`);
    if (archived.count) parts.push(`${archived.count} archived because they have sales history`);
    return { ok: true, message: parts.join(", ") + "." };
  }

  const data =
    operation === "publish"
      ? { status: "ACTIVE" as const, publishedAt: new Date() }
      : operation === "draft"
        ? { status: "DRAFT" as const }
        : operation === "archive"
          ? { status: "ARCHIVED" as const }
          : operation === "feature"
            ? { isFeatured: true }
            : { isFeatured: false };

  const { count } = await db.product.updateMany({
    where: { id: { in: productIds } },
    data,
  });

  await recordAudit({
    actorId: actor.id,
    action: `product.bulk_${operation}`,
    entity: "Product",
    after: { count, productIds },
  });

  revalidateProduct();
  return { ok: true, message: `${count} product${count === 1 ? "" : "s"} updated.` };
}

// ---------------------------------------------------------------------------
// Duplicate & reorder
// ---------------------------------------------------------------------------

/**
 * Copies a product as a draft: copy, options, variants and pictures.
 *
 * A new colourway or a second size of the same piece is almost always the last
 * one with three fields changed, and rebuilding the option matrix by hand is
 * how those come out inconsistent. Stock starts at zero on the copy, because
 * the shelf did not get fuller when the record did.
 */
export async function duplicateProductAction(productId: string): Promise<AdminState> {
  const actor = await requirePermission("products:write");

  const source = await db.product.findUnique({
    where: { id: productId },
    include: {
      options: { orderBy: { position: "asc" }, include: { values: { orderBy: { position: "asc" } } } },
      variants: { orderBy: { position: "asc" }, include: { optionValues: true } },
      images: { orderBy: { position: "asc" } },
      categories: true,
      collections: true,
    },
  });
  if (!source) return fail("That product no longer exists.");

  const title = `${source.title} (copy)`;
  const slug = await uniqueSlug("product", title);
  const stem = skuFromTitle(title);
  const suffix = Date.now().toString(36).slice(-3).toUpperCase();

  const copy = await db.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        title,
        slug,
        description: source.description,
        shortDescription: source.shortDescription,
        status: "DRAFT",
        minPrice: source.minPrice,
        maxPrice: source.maxPrice,
        compareAtPrice: source.compareAtPrice,
        brand: source.brand,
        material: source.material,
        care: source.care,
        isFeatured: false,
        tags: source.tags,
        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
        searchText: buildSearchText({
          title,
          tags: source.tags,
          brand: source.brand,
          material: source.material,
          shortDescription: source.shortDescription,
        }),
        categories: { create: source.categories.map((c) => ({ categoryId: c.categoryId })) },
        collections: { create: source.collections.map((c) => ({ collectionId: c.collectionId })) },
      },
    });

    // Old value id -> new value id, so variants and pinned pictures follow.
    const valueMap = new Map<string, string>();
    for (const option of source.options) {
      const newOption = await tx.productOption.create({
        data: { productId: created.id, name: option.name, position: option.position },
      });
      for (const value of option.values) {
        const newValue = await tx.productOptionValue.create({
          data: {
            optionId: newOption.id,
            value: value.value,
            hexColor: value.hexColor,
            position: value.position,
          },
        });
        valueMap.set(value.id, newValue.id);
      }
    }

    for (const [index, variant] of source.variants.entries()) {
      const created2 = await tx.variant.create({
        data: {
          productId: created.id,
          title: variant.title,
          sku: `${stem}-${suffix}-${String(index + 1).padStart(2, "0")}`,
          barcode: null,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          costPrice: variant.costPrice,
          weightGrams: variant.weightGrams,
          isActive: variant.isActive,
          position: variant.position,
          optionValues: {
            create: variant.optionValues
              .map((ov) => valueMap.get(ov.optionValueId))
              .filter((id): id is string => Boolean(id))
              .map((optionValueId) => ({ optionValueId })),
          },
        },
      });
      await tx.inventoryItem.create({ data: { variantId: created2.id, onHand: 0 } });
    }

    for (const image of source.images) {
      await tx.productImage.create({
        data: {
          productId: created.id,
          url: image.url,
          alt: image.alt,
          position: image.position,
          mediaId: image.mediaId,
          optionValueId: image.optionValueId ? (valueMap.get(image.optionValueId) ?? null) : null,
        },
      });
    }

    return created;
  });

  await recordAudit({
    actorId: actor.id,
    action: "product.duplicate",
    entity: "Product",
    entityId: copy.id,
    after: { from: productId, title, slug },
  });

  revalidateProduct(copy.id);
  redirect(`/admin/products/${copy.id}`);
}

/** Swaps a variant with its neighbour, so the picker lists sizes in the order they are sold. */
export async function moveVariantAction(
  productId: string,
  variantId: string,
  direction: "up" | "down",
): Promise<AdminState> {
  await requirePermission("products:write");

  const variants = await db.variant.findMany({
    where: { productId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const index = variants.findIndex((v) => v.id === variantId);
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapWith < 0 || swapWith >= variants.length) return { ok: true };

  // Positions are rewritten from the resulting order rather than swapped, so
  // rows that were seeded with the same position sort deterministically after.
  const order = [...variants];
  [order[index], order[swapWith]] = [order[swapWith], order[index]];

  await db.$transaction(
    order.map((variant, position) =>
      db.variant.update({ where: { id: variant.id }, data: { position } }),
    ),
  );

  revalidateProduct(productId);
  return { ok: true };
}
