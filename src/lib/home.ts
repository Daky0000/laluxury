import { db } from "./db";
import { productCardSelect } from "./catalog";
import { toTile, type ProductTileData } from "./product-view";
import type { HomeSection } from "./home-sections";

/**
 * Reads for the storefront home page. Everything goes through the shared
 * `toTile` mapping, so the home grids and the all-products grid describe a
 * product the same way.
 *
 * Each read takes the section that asked for it, because what a section shows
 * is now the owner's choice rather than a constant: a product row can be left
 * to fill itself, pinned to a set of rooms, or listed piece by piece.
 */

export type RoomCard = {
  name: string;
  slug: string;
  imageUrl: string | null;
  /** Live count of what is on sale in the room, shown under the card. */
  count: number;
};

const roomSelect = {
  name: true,
  slug: true,
  imageUrl: true,
  _count: { select: { products: { where: { product: { status: "ACTIVE" as const } } } } },
};

function toRoomCard(row: {
  name: string;
  slug: string;
  imageUrl: string | null;
  _count: { products: number };
}): RoomCard {
  return { name: row.name, slug: row.slug, imageUrl: row.imageUrl, count: row._count.products };
}

/**
 * The cards for a "shop by room" section.
 *
 * With no rooms chosen the section fills itself from the top-level rooms, which
 * is what a store wants before anybody has curated anything. Once the owner has
 * picked cards, those are the cards — in their order, children included, and
 * with no limit applied over a list they chose by hand.
 */
export async function roomCards(section: Pick<HomeSection, "categorySlugs" | "limit">) {
  if (section.categorySlugs.length > 0) {
    const rows = await db.category.findMany({
      where: { isActive: true, slug: { in: section.categorySlugs } },
      select: roomSelect,
    });

    const bySlug = new Map(rows.map((row) => [row.slug, toRoomCard(row)]));
    return section.categorySlugs
      .map((slug) => bySlug.get(slug))
      .filter((card): card is RoomCard => card !== undefined);
  }

  const rows = await db.category.findMany({
    where: { isActive: true, parentId: null },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    take: section.limit,
    select: roomSelect,
  });

  return rows.map(toRoomCard);
}

/** The pieces a product section shows, in the order it shows them. */
export async function sectionProducts(section: HomeSection): Promise<ProductTileData[]> {
  if (section.source === "picked") {
    if (section.productIds.length === 0) return [];

    const rows = await db.product.findMany({
      where: { status: "ACTIVE", id: { in: section.productIds } },
      select: productCardSelect,
    });

    // Hand-picked means hand-ordered too, so the rows come back in the order
    // the owner dragged them into rather than the order the database found them.
    const byId = new Map(rows.map((row) => [row.id, toTile(row)]));
    return section.productIds
      .map((id) => byId.get(id))
      .filter((tile): tile is ProductTileData => tile !== undefined);
  }

  if (section.source === "category" && section.categorySlugs.length > 0) {
    const rows = await db.product.findMany({
      where: {
        status: "ACTIVE",
        categories: { some: { category: { slug: { in: section.categorySlugs } } } },
      },
      select: productCardSelect,
      orderBy: [{ isFeatured: "desc" }, { minPrice: "asc" }, { createdAt: "asc" }],
      take: section.limit,
    });

    return rows.map(toTile);
  }

  // Automatic: everything on sale except the student-only range, which has its
  // own section. A product may sit in both rooms (the sleep pillow does) and
  // still belong here.
  const rows = await db.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [
        { categories: { none: {} } },
        { categories: { some: { category: { slug: { not: "student" } } } } },
      ],
    },
    select: productCardSelect,
    orderBy: [{ isFeatured: "desc" }, { createdAt: "asc" }],
    take: section.limit,
  });

  return rows.map(toTile);
}

/**
 * The room tabs above a tabbed product grid: the rooms the owner named, or
 * every top-level room bar the student range when they named none.
 */
export async function sectionTabs(section: HomeSection) {
  const rows = await db.category.findMany({
    where:
      section.categorySlugs.length > 0
        ? { isActive: true, slug: { in: section.categorySlugs } }
        : { isActive: true, parentId: null, slug: { not: "student" } },
    orderBy: [{ position: "asc" }, { name: "asc" }],
    select: { name: true, slug: true },
  });

  if (section.categorySlugs.length === 0) {
    return rows.map((row) => ({ label: row.name, slug: row.slug }));
  }

  const bySlug = new Map(rows.map((row) => [row.slug, row.name]));
  return section.categorySlugs
    .filter((slug) => bySlug.has(slug))
    .map((slug) => ({ label: bySlug.get(slug)!, slug }));
}
