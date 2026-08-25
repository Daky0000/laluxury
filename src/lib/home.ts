import { db } from "./db";
import type { Prisma } from "@/generated/prisma";

/**
 * Reads for the storefront home page.
 *
 * The home grids need a flatter shape than the shop grid: one image, one
 * category label, a badge and the single variant id that "Add to bag" can use.
 * Building that here keeps the page component to layout, and keeps the client
 * grid props small enough to serialise cheaply.
 */

const homeProductSelect = {
  id: true,
  title: true,
  slug: true,
  minPrice: true,
  maxPrice: true,
  compareAtPrice: true,
  tags: true,
  isFeatured: true,
  images: { orderBy: { position: "asc" }, take: 1, select: { url: true, alt: true } },
  categories: {
    select: { category: { select: { name: true, slug: true, position: true } } },
  },
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      inventory: {
        select: { onHand: true, reserved: true, trackInventory: true, allowBackorder: true },
      },
    },
  },
} satisfies Prisma.ProductSelect;

type HomeProductRow = Prisma.ProductGetPayload<{ select: typeof homeProductSelect }>;

export type HomeProduct = {
  id: string;
  title: string;
  slug: string;
  /** Category label shown under the title, e.g. "Bedding". */
  category: string;
  categorySlug: string;
  price: number;
  maxPrice: number;
  compareAtPrice: number | null;
  /** True when the product has several sizes, so the price reads "from ₵x". */
  hasRange: boolean;
  badge: string | null;
  imageUrl: string | null;
  imageAlt: string;
  /** Set only when a single active variant exists, so it can be added in one tap. */
  variantId: string | null;
  inStock: boolean;
};

/** Merchandising badges are ordinary tags, so the owner can set them in the admin. */
const BADGES: Record<string, string> = {
  bestseller: "Bestseller",
  new: "New",
  luxe: "Luxe",
  deal: "Deal",
  sale: "Sale",
};

function toHomeProduct(product: HomeProductRow): HomeProduct {
  const category = [...product.categories]
    .sort((a, b) => a.category.position - b.category.position)
    .find((c) => c.category.slug !== "student")?.category ??
    product.categories[0]?.category ?? { name: "", slug: "" };

  const badgeTag = product.tags.find((tag) => BADGES[tag.toLowerCase()]);

  const inStock = product.variants.some((variant) => {
    const inv = variant.inventory;
    if (!inv || !inv.trackInventory || inv.allowBackorder) return true;
    return inv.onHand - inv.reserved > 0;
  });

  return {
    id: product.id,
    title: product.title,
    slug: product.slug,
    category: category.name,
    categorySlug: category.slug,
    price: product.minPrice,
    maxPrice: product.maxPrice,
    compareAtPrice: product.compareAtPrice,
    hasRange: product.maxPrice > product.minPrice,
    badge: badgeTag ? BADGES[badgeTag.toLowerCase()] : null,
    imageUrl: product.images[0]?.url ?? null,
    imageAlt: product.images[0]?.alt ?? product.title,
    variantId: product.variants.length === 1 ? product.variants[0].id : null,
    inStock,
  };
}

/** The main "edit" grid: everything on sale except the student range. */
export async function editProducts(limit = 16): Promise<HomeProduct[]> {
  const rows = await db.product.findMany({
    where: {
      status: "ACTIVE",
      // Anything that is not *only* a student item. A product may sit in both
      // rooms (the sleep pillow does) and still belong in the main grid.
      OR: [
        { categories: { none: {} } },
        { categories: { some: { category: { slug: { not: "student" } } } } },
      ],
    },
    select: homeProductSelect,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "asc" }],
    take: limit,
  });

  return rows.map(toHomeProduct);
}

/** The sage student essentials row. */
export async function studentProducts(limit = 4): Promise<HomeProduct[]> {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", categories: { some: { category: { slug: "student" } } } },
    select: homeProductSelect,
    orderBy: [{ minPrice: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  return rows.map(toHomeProduct);
}

/** "Shop by room" tiles, with a live count of what is in each room. */
export async function roomCategories(limit = 4) {
  const rows = await db.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    take: limit,
    select: {
      name: true,
      slug: true,
      imageUrl: true,
      _count: { select: { products: { where: { product: { status: "ACTIVE" } } } } },
    },
  });

  return rows.map((row) => ({
    name: row.name,
    slug: row.slug,
    imageUrl: row.imageUrl,
    count: row._count.products,
  }));
}
