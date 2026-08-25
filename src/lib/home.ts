import { db } from "./db";
import { productCardSelect } from "./catalog";
import { toTile, type ProductTileData } from "./product-view";

/**
 * Reads for the storefront home page. Everything goes through the shared
 * `toTile` mapping, so the home grids and the all-products grid describe a
 * product the same way.
 */

/** The main "edit" grid: everything on sale except the student-only range. */
export async function editProducts(limit = 20): Promise<ProductTileData[]> {
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
    select: productCardSelect,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "asc" }],
    take: limit,
  });

  return rows.map(toTile);
}

/** The sage student essentials row. */
export async function studentProducts(limit = 4): Promise<ProductTileData[]> {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", categories: { some: { category: { slug: "student" } } } },
    select: productCardSelect,
    orderBy: [{ minPrice: "asc" }, { createdAt: "asc" }],
    take: limit,
  });

  return rows.map(toTile);
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
