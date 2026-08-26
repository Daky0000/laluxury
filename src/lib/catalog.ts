import { db } from "./db";
import type { Prisma, ProductStatus } from "@/generated/prisma";

/**
 * Storefront catalog reads: search, filtering, sorting and facets.
 *
 * Search runs against the denormalised `searchText` column (title + tags +
 * brand + material, lowercased) which is maintained on every product write.
 * That keeps it a single indexed LIKE rather than a join across four tables.
 */

export const PRODUCT_SORTS = {
  featured: "Featured",
  newest: "Newest",
  "price-asc": "Price: low to high",
  "price-desc": "Price: high to low",
  "name-asc": "Name: A to Z",
} as const;

export type ProductSort = keyof typeof PRODUCT_SORTS;

export type CatalogFilters = {
  q?: string;
  categorySlugs?: string[];
  collectionSlug?: string;
  minPrice?: number;
  maxPrice?: number;
  tags?: string[];
  /** Option values, e.g. { Colour: ["Ivory"], Size: ["Large"] } */
  options?: Record<string, string[]>;
  inStockOnly?: boolean;
  /** Only pieces whose "was" price is above what they sell for today. */
  onSaleOnly?: boolean;
  featuredOnly?: boolean;
  sort?: ProductSort;
  page?: number;
  perPage?: number;
};

export const productCardSelect = {
  id: true,
  title: true,
  slug: true,
  shortDescription: true,
  minPrice: true,
  maxPrice: true,
  compareAtPrice: true,
  isFeatured: true,
  tags: true,
  brand: true,
  createdAt: true,
  images: { orderBy: { position: "asc" }, take: 2, select: { url: true, alt: true } },
  categories: {
    select: { category: { select: { name: true, slug: true, position: true } } },
  },
  // Carried so a tile can show its colour swatches without a second read.
  options: {
    orderBy: { position: "asc" },
    select: {
      name: true,
      values: { orderBy: { position: "asc" }, select: { value: true, hexColor: true } },
    },
  },
  variants: {
    where: { isActive: true },
    select: {
      id: true,
      price: true,
      inventory: { select: { onHand: true, reserved: true, trackInventory: true, allowBackorder: true } },
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductCard = Prisma.ProductGetPayload<{ select: typeof productCardSelect }>;

function orderBy(sort: ProductSort | undefined): Prisma.ProductOrderByWithRelationInput[] {
  switch (sort) {
    case "newest":
      return [{ publishedAt: "desc" }, { createdAt: "desc" }];
    case "price-asc":
      return [{ minPrice: "asc" }];
    case "price-desc":
      return [{ minPrice: "desc" }];
    case "name-asc":
      return [{ title: "asc" }];
    default:
      // Curated pieces first, then the order the catalog was built in, so the
      // default view matches how the rooms read on the artboards.
      return [{ isFeatured: "desc" }, { createdAt: "asc" }];
  }
}

function buildWhere(filters: CatalogFilters, status: ProductStatus | null = "ACTIVE") {
  const and: Prisma.ProductWhereInput[] = [];

  if (status) and.push({ status });

  if (filters.q?.trim()) {
    const term = filters.q.trim().toLowerCase();
    and.push({
      OR: [
        { searchText: { contains: term } },
        { title: { contains: term, mode: "insensitive" } },
        { variants: { some: { sku: { contains: term, mode: "insensitive" } } } },
      ],
    });
  }

  if (filters.categorySlugs?.length) {
    and.push({ categories: { some: { category: { slug: { in: filters.categorySlugs } } } } });
  }

  if (filters.collectionSlug) {
    and.push({ collections: { some: { collection: { slug: filters.collectionSlug } } } });
  }

  if (filters.minPrice !== undefined) and.push({ maxPrice: { gte: filters.minPrice } });
  if (filters.maxPrice !== undefined) and.push({ minPrice: { lte: filters.maxPrice } });

  if (filters.tags?.length) and.push({ tags: { hasSome: filters.tags } });

  if (filters.featuredOnly) and.push({ isFeatured: true });

  // Each selected option group is ANDed, values within a group are ORed:
  // "Ivory or Sand" AND "Large".
  if (filters.options) {
    for (const [optionName, values] of Object.entries(filters.options)) {
      if (!values.length) continue;
      and.push({
        variants: {
          some: {
            isActive: true,
            optionValues: {
              some: {
                optionValue: {
                  value: { in: values },
                  option: { name: optionName },
                },
              },
            },
          },
        },
      });
    }
  }

  // A field reference, so the comparison happens in Postgres rather than by
  // pulling every product back to check it.
  if (filters.onSaleOnly) {
    and.push({ compareAtPrice: { gt: db.product.fields.minPrice } });
  }

  if (filters.inStockOnly) {
    and.push({
      variants: {
        some: {
          isActive: true,
          OR: [
            { inventory: { is: null } },
            { inventory: { trackInventory: false } },
            { inventory: { allowBackorder: true } },
            { inventory: { onHand: { gt: 0 } } },
          ],
        },
      },
    });
  }

  return and.length ? { AND: and } : {};
}

export function isInStock(product: Pick<ProductCard, "variants">): boolean {
  return product.variants.some((v) => {
    const inv = v.inventory;
    if (!inv || !inv.trackInventory || inv.allowBackorder) return true;
    return inv.onHand - inv.reserved > 0;
  });
}

export async function searchProducts(filters: CatalogFilters) {
  const page = Math.max(1, filters.page ?? 1);
  // The grid loads more by growing its page rather than paging, so the ceiling
  // is higher than a single screenful — but still bounded.
  const perPage = Math.min(240, Math.max(1, filters.perPage ?? 12));
  const where = buildWhere(filters);

  const [items, total] = await Promise.all([
    db.product.findMany({
      where,
      select: productCardSelect,
      orderBy: orderBy(filters.sort),
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    db.product.count({ where }),
  ]);

  return {
    items,
    total,
    page,
    perPage,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
    hasNext: page * perPage < total,
    hasPrevious: page > 1,
  };
}

/**
 * Facet counts for the filter rail. Computed against the *unfiltered* active
 * catalog so a shopper can always see and undo a filter that returned nothing.
 */
export async function catalogFacets() {
  const [categories, priceRange, tagRows, options, productTotal] = await Promise.all([
    db.category.findMany({
      where: { isActive: true },
      orderBy: [{ position: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        parentId: true,
        _count: { select: { products: true } },
      },
    }),
    db.product.aggregate({
      where: { status: "ACTIVE" },
      _min: { minPrice: true },
      _max: { maxPrice: true },
    }),
    db.product.findMany({
      where: { status: "ACTIVE" },
      select: { tags: true },
    }),
    db.productOption.findMany({
      where: { product: { status: "ACTIVE" } },
      select: {
        name: true,
        values: { select: { value: true, hexColor: true }, orderBy: { position: "asc" } },
      },
    }),
    // Counted rather than summed from the categories: a product can sit in
    // several rooms, so the per-room counts add up to more than the catalog.
    db.product.count({ where: { status: "ACTIVE" } }),
  ]);

  // Collapse duplicate option names across products into one facet group.
  const optionMap = new Map<string, Map<string, string | null>>();
  for (const option of options) {
    const group = optionMap.get(option.name) ?? new Map<string, string | null>();
    for (const v of option.values) {
      if (!group.has(v.value)) group.set(v.value, v.hexColor);
    }
    optionMap.set(option.name, group);
  }

  const tagCounts = new Map<string, number>();
  for (const row of tagRows) {
    for (const tag of row.tags) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
  }

  return {
    productTotal,
    categories: categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      parentId: c.parentId,
      productCount: c._count.products,
    })),
    priceMin: priceRange._min.minPrice ?? 0,
    priceMax: priceRange._max.maxPrice ?? 0,
    tags: [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([name, count]) => ({ name, count })),
    options: [...optionMap.entries()].map(([name, values]) => ({
      name,
      values: [...values.entries()].map(([value, hexColor]) => ({ value, hexColor })),
    })),
  };
}

export const productDetailInclude = {
  images: { orderBy: { position: "asc" } },
  options: {
    orderBy: { position: "asc" },
    include: { values: { orderBy: { position: "asc" } } },
  },
  variants: {
    where: { isActive: true },
    orderBy: { position: "asc" },
    include: {
      inventory: true,
      optionValues: { include: { optionValue: { include: { option: true } } } },
    },
  },
  categories: { include: { category: true } },
  collections: { include: { collection: true } },
  reviews: {
    where: { isApproved: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  },
} satisfies Prisma.ProductInclude;

export type ProductDetail = Prisma.ProductGetPayload<{ include: typeof productDetailInclude }>;

export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  return db.product.findFirst({
    where: { slug, status: "ACTIVE" },
    include: productDetailInclude,
  });
}

export async function ratingFor(productId: string) {
  const result = await db.review.aggregate({
    where: { productId, isApproved: true },
    _avg: { rating: true },
    _count: { rating: true },
  });
  return {
    average: result._avg.rating ?? 0,
    count: result._count.rating,
  };
}

/** Same categories first, then anything else recent. */
export async function relatedProducts(product: ProductDetail, limit = 4) {
  const categoryIds = product.categories.map((c) => c.categoryId);

  const sameCategory = categoryIds.length
    ? await db.product.findMany({
        where: {
          status: "ACTIVE",
          id: { not: product.id },
          categories: { some: { categoryId: { in: categoryIds } } },
        },
        select: productCardSelect,
        take: limit,
        orderBy: { isFeatured: "desc" },
      })
    : [];

  if (sameCategory.length >= limit) return sameCategory;

  const filler = await db.product.findMany({
    where: {
      status: "ACTIVE",
      id: { notIn: [product.id, ...sameCategory.map((p) => p.id)] },
    },
    select: productCardSelect,
    take: limit - sameCategory.length,
    orderBy: { createdAt: "desc" },
  });

  return [...sameCategory, ...filler];
}

/** Rebuilt on every product write so search stays in step with the catalog. */
export function buildSearchText(product: {
  title: string;
  tags: string[];
  brand?: string | null;
  material?: string | null;
  shortDescription?: string | null;
}): string {
  return [
    product.title,
    ...product.tags,
    product.brand ?? "",
    product.material ?? "",
    product.shortDescription ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Keeps Product.minPrice/maxPrice in step with its variants. */
export async function refreshPriceRange(productId: string): Promise<void> {
  const variants = await db.variant.findMany({
    where: { productId, isActive: true },
    select: { price: true },
  });

  const prices = variants.map((v) => v.price);
  await db.product.update({
    where: { id: productId },
    data: {
      minPrice: prices.length ? Math.min(...prices) : 0,
      maxPrice: prices.length ? Math.max(...prices) : 0,
    },
  });
}

/** Type-ahead for the storefront search bar and the agent. */
export async function quickSearch(term: string, limit = 6) {
  const q = term.trim().toLowerCase();
  if (!q) return [];

  return db.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ searchText: { contains: q } }, { title: { contains: q, mode: "insensitive" } }],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      minPrice: true,
      images: { orderBy: { position: "asc" }, take: 1, select: { url: true } },
    },
    take: limit,
  });
}
