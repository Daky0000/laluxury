import { isInStock, type ProductCard } from "./catalog";

/**
 * The single shape every product tile renders from.
 *
 * One mapping, used by the home page, the all-products grid, related products
 * and anything added later, so a product looks and behaves the same wherever
 * it appears — and so an edit in the admin shows up in every one of them.
 */

export type ProductTileData = {
  id: string;
  title: string;
  slug: string;
  /** Category label under the title, e.g. "Bedding". */
  category: string;
  categorySlug: string;
  price: number;
  maxPrice: number;
  compareAtPrice: number | null;
  /** True when several variants are priced differently, so the price reads "from ₵x". */
  hasRange: boolean;
  badge: string | null;
  imageUrl: string | null;
  imageAlt: string;
  /** Second image, revealed on hover where the product has one. */
  hoverImageUrl: string | null;
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

export function toTile(product: ProductCard): ProductTileData {
  // A product can sit in several rooms; label it with the first non-student one
  // so the student range still reads as Bedding, Living and so on.
  const category =
    [...product.categories]
      .sort((a, b) => a.category.position - b.category.position)
      .find((c) => c.category.slug !== "student")?.category ??
    product.categories[0]?.category ?? { name: "", slug: "" };

  const badgeTag = product.tags.find((tag) => BADGES[tag.toLowerCase()]);
  const [primary, secondary] = product.images;

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
    imageUrl: primary?.url ?? null,
    imageAlt: primary?.alt ?? product.title,
    hoverImageUrl: secondary?.url ?? null,
    variantId: product.variants.length === 1 ? product.variants[0].id : null,
    inStock: isInStock(product),
  };
}
