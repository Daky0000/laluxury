import { db } from "@/lib/db";
import type { Prisma, ProductStatus } from "@/generated/prisma";
import { buildSearchText } from "@/lib/catalog";
import { uniqueSlug } from "@/lib/slug";

/**
 * The one place a product is written with its options, versions, stock,
 * pictures and category links. The single-product form and Bulk Product Add
 * both come through here, so there is no third way of building a product.
 *
 * Everything for one product happens in one transaction: either the whole
 * listing exists afterwards, or nothing does.
 */

export type NewVariantInput = {
  /** Option values in option order; empty for a product with no options. */
  values: string[];
  sku: string;
  barcode?: string | null;
  price: number;
  compareAtPrice?: number | null;
  costPrice?: number | null;
  weightGrams?: number | null;
  isActive?: boolean;
  stock?: number | null;
  trackInventory?: boolean;
  allowBackorder?: boolean;
};

export type NewImageInput = {
  url: string;
  alt?: string | null;
  mediaId?: string | null;
  /** Shows when this option value is selected, e.g. { option: "Colour", value: "Black" }. */
  option?: string | null;
  optionValue?: string | null;
};

export type NewProductInput = {
  title: string;
  slug?: string | null;
  status?: ProductStatus;
  shortDescription?: string | null;
  description?: string | null;
  brand?: string | null;
  material?: string | null;
  care?: string | null;
  tags?: string[];
  isFeatured?: boolean;
  isPreorder?: boolean;
  preorderLeadTime?: string | null;
  preorderDepositPercent?: number | null;
  preorderNote?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  compareAtPrice?: number | null;
  options: { name: string; values: string[] }[];
  variants: NewVariantInput[];
  images?: NewImageInput[];
  categoryIds?: string[];
  collectionIds?: string[];
};

export class CatalogWriteError extends Error {}

/**
 * Makes every SKU in the input unique — within the product and against the
 * catalog — by adding -2, -3 … to clashing ones. For generated SKUs (imports),
 * where a clash means "pick another", not "this is the same item".
 */
export async function uniquifySkus(input: NewProductInput, client?: Prisma.TransactionClient): Promise<NewProductInput> {
  const variant = (client?.variant ?? db.variant) as typeof db.variant;
  const isTaken = async (sku: string) => Boolean(await variant.findUnique({ where: { sku }, select: { id: true } }));
  const used = new Set<string>();
  const variants = [];
  for (const v of input.variants) {
    let sku = v.sku;
    for (let n = 2; used.has(sku) || (await isTaken(sku)); n++) sku = `${v.sku}-${n}`;
    used.add(sku);
    variants.push({ ...v, sku });
  }
  return { ...input, variants };
}

/** Throws when a SKU is repeated in the input or already used by another variant. */
export async function assertSkusFree(skus: string[]): Promise<void> {
  const seen = new Set<string>();
  for (const sku of skus) {
    if (seen.has(sku)) throw new CatalogWriteError(`SKU ${sku} is used twice in this product.`);
    seen.add(sku);
  }
  const taken = await db.variant.findMany({ where: { sku: { in: skus } }, select: { sku: true } });
  if (taken.length) throw new CatalogWriteError(`SKU already in use: ${taken.map((t) => t.sku).join(", ")}`);
}

export async function createCatalogProduct(
  input: NewProductInput,
  tx?: Prisma.TransactionClient,
): Promise<{ id: string; slug: string }> {
  if (!input.title.trim()) throw new CatalogWriteError("A product needs a title.");
  if (!input.variants.length) throw new CatalogWriteError("A product needs at least one version.");
  for (const v of input.variants) {
    if (v.values.length !== input.options.length) {
      throw new CatalogWriteError(`Version ${v.sku} does not have a value for every option.`);
    }
  }

  const slug = await uniqueSlug("product", input.slug || input.title);
  const run = async (t: Prisma.TransactionClient) => write(t, input, slug);
  return tx ? run(tx) : db.$transaction(run, { timeout: 30_000 });
}

async function write(tx: Prisma.TransactionClient, input: NewProductInput, slug: string) {
  const tags = input.tags ?? [];
  const status = input.status ?? "DRAFT";
  const active = input.variants.filter((v) => v.isActive !== false).map((v) => v.price);
  const prices = active.length ? active : input.variants.map((v) => v.price);

  const product = await tx.product.create({
    data: {
      title: input.title.trim(),
      slug,
      status,
      shortDescription: input.shortDescription ?? null,
      description: input.description ?? null,
      brand: input.brand ?? null,
      material: input.material ?? null,
      care: input.care ?? null,
      tags,
      isFeatured: Boolean(input.isFeatured),
      isPreorder: Boolean(input.isPreorder),
      preorderLeadTime: input.isPreorder ? (input.preorderLeadTime ?? "4–6 weeks") : null,
      preorderDepositPercent: input.isPreorder ? (input.preorderDepositPercent ?? 50) : null,
      preorderNote: input.isPreorder ? (input.preorderNote ?? null) : null,
      metaTitle: input.metaTitle ?? null,
      metaDescription: input.metaDescription ?? null,
      publishedAt: status === "ACTIVE" ? new Date() : null,
      minPrice: Math.min(...prices),
      maxPrice: Math.max(...prices),
      compareAtPrice: input.compareAtPrice ?? null,
      searchText: buildSearchText({
        title: input.title,
        tags,
        brand: input.brand,
        material: input.material,
        shortDescription: input.shortDescription,
      }),
      categories: { create: [...new Set(input.categoryIds ?? [])].map((categoryId) => ({ categoryId })) },
      collections: { create: [...new Set(input.collectionIds ?? [])].map((collectionId) => ({ collectionId })) },
    },
    select: { id: true, slug: true },
  });

  // Options and their values; remember each value's id for linking.
  const valueIds = new Map<string, string>(); // "Colour|Black" → id
  for (const [position, option] of input.options.entries()) {
    const created = await tx.productOption.create({
      data: {
        productId: product.id,
        name: option.name,
        position,
        values: { create: option.values.map((value, i) => ({ value, position: i })) },
      },
      select: { name: true, values: { select: { id: true, value: true } } },
    });
    for (const v of created.values) valueIds.set(`${created.name}|${v.value}`, v.id);
  }

  for (const [position, v] of input.variants.entries()) {
    const ids = v.values.map((value, i) => {
      const id = valueIds.get(`${input.options[i].name}|${value}`);
      if (!id) throw new CatalogWriteError(`"${value}" is not a listed ${input.options[i].name}.`);
      return id;
    });
    await tx.variant.create({
      data: {
        productId: product.id,
        title: v.values.length ? v.values.join(" / ") : "Default",
        sku: v.sku,
        barcode: v.barcode ?? null,
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        costPrice: v.costPrice ?? null,
        weightGrams: v.weightGrams ?? null,
        isActive: v.isActive !== false,
        position,
        optionValues: { create: ids.map((optionValueId) => ({ optionValueId })) },
        inventory: {
          create: {
            onHand: Math.max(0, v.stock ?? 0),
            trackInventory: v.trackInventory !== false,
            allowBackorder: Boolean(v.allowBackorder ?? input.isPreorder),
          },
        },
      },
    });
  }

  for (const [position, image] of (input.images ?? []).entries()) {
    const optionValueId =
      image.option && image.optionValue ? (valueIds.get(`${image.option}|${image.optionValue}`) ?? null) : null;
    await tx.productImage.create({
      data: {
        productId: product.id,
        url: image.url,
        alt: image.alt ?? null,
        position,
        mediaId: image.mediaId ?? null,
        optionValueId,
      },
    });
  }

  return product;
}
