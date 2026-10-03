import { db } from "./db";
import { publicAssetUrl } from "./media-url";
import { availableOf } from "./inventory";
import type { Prisma } from "@/generated/prisma";

/** Public fields shared by mobile product cards and detail responses. */
export const storeProductSelect = {
  id: true, title: true, slug: true, status: true,
  minPrice: true, maxPrice: true, compareAtPrice: true,
  brand: true, material: true, isFeatured: true, isPreorder: true,
  preorderLeadTime: true, preorderDepositPercent: true, preorderNote: true,
  tags: true, createdAt: true, updatedAt: true,
  images: { orderBy: { position: "asc" }, select: { id: true, url: true, alt: true, position: true, optionValueId: true } },
  categories: { where: { category: { isActive: true } }, select: { category: { select: { id: true, name: true, slug: true } } } },
  collections: { where: { collection: { isActive: true } }, select: { collection: { select: { id: true, name: true, slug: true } } } },
  variants: {
    where: { isActive: true }, orderBy: { position: "asc" },
    select: {
      id: true, title: true, sku: true, price: true, compareAtPrice: true, isActive: true,
      inventory: { select: { onHand: true, reserved: true, allowBackorder: true, trackInventory: true } },
      optionValues: { select: { optionValueId: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export function storeProduct(product: Prisma.ProductGetPayload<{ select: typeof storeProductSelect }>) {
  const variants = product.variants.map(({ inventory, ...variant }) => ({
    ...variant,
    available: inventory && inventory.trackInventory && !inventory.allowBackorder
      ? Math.max(0, availableOf(inventory)) : null,
  }));
  return {
    ...product,
    images: product.images.map((image) => ({ ...image, url: publicAssetUrl(image.url) })),
    imageUrl: product.images[0] ? publicAssetUrl(product.images[0].url) : null,
    variants,
    inStock: product.isPreorder || variants.some((variant) => variant.available === null || variant.available > 0),
    // Existing mobile cards use these aggregates; raw inventory stays private.
    totalStock: variants.reduce((sum, variant) => sum + (variant.available ?? 1), 0),
    variantCount: variants.length, imageCount: product.images.length,
    categories: product.categories.map(({ category }) => category),
    collections: product.collections.map(({ collection }) => collection),
  };
}

export async function storeProductList(url: URL) {
  const integer = (key: string, fallback: number, max: number) => {
    const value = Number(url.searchParams.get(key) ?? fallback);
    return Number.isSafeInteger(value) && value > 0 ? Math.min(value, max) : fallback;
  };
  const page = integer("page", 1, 10000);
  const limit = integer("limit", 12, 48);
  const q = url.searchParams.get("q")?.trim().slice(0, 200);
  const categoryId = url.searchParams.get("categoryId");
  const collectionId = url.searchParams.get("collectionId");
  const where: Prisma.ProductWhereInput = {
    status: "ACTIVE",
    ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { searchText: { contains: q.toLowerCase() } }] } : {}),
    ...(categoryId ? { categories: { some: { categoryId, category: { isActive: true } } } } : {}),
    ...(collectionId ? { collections: { some: { collectionId, collection: { isActive: true } } } } : {}),
    ...(url.searchParams.has("isFeatured") ? { isFeatured: url.searchParams.get("isFeatured") === "true" } : {}),
    ...(url.searchParams.has("isPreorder") ? { isPreorder: url.searchParams.get("isPreorder") === "true" } : {}),
  };
  const [total, products] = await Promise.all([
    db.product.count({ where }),
    db.product.findMany({ where, skip: (page - 1) * limit, take: limit,
      orderBy: [{ isFeatured: "desc" }, { createdAt: "desc" }],
      select: { ...storeProductSelect, images: { ...storeProductSelect.images, take: 1 } },
    }),
  ]);
  return { products: products.map(storeProduct), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
