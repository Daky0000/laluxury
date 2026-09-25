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
  /** Category label under the title, e.g. "Bedding" or "Pre-Order". */
  category: string;
  categorySlug: string;
  price: number;
  maxPrice: number;
  compareAtPrice: number | null;
  /** True when several variants are priced differently, so the price reads "from ₵x". */
  hasRange: boolean;
  badge: string | null;
  isPreorder: boolean;
  preorderLeadTime: string | null;
  preorderDepositPercent: number | null;
  imageUrl: string | null;
  imageAlt: string;
  /** Second image, revealed on hover where the product has one. */
  hoverImageUrl: string | null;
  /** Set only when a single active variant exists, so it can be added in one tap. */
  variantId: string | null;
  inStock: boolean;
  /** Colour dots under the title, from whichever option carries hex values. */
  swatches: { name: string; hex: string }[];
};

/** Merchandising badges are ordinary tags, so the owner can set them in the admin. */
const BADGES: Record<string, string> = {
  "pre-order": "Pre-Order",
  preorder: "Pre-Order",
  bestseller: "Bestseller",
  new: "New",
  luxe: "Luxe",
  deal: "Deal",
  sale: "Sale",
};

export function toTile(product: ProductCard): ProductTileData {
  const isPreorder =
    Boolean(product.isPreorder) ||
    product.categories.some((c) => c.category.slug === "pre-order") ||
    product.tags.some((t) => t.toLowerCase() === "pre-order" || t.toLowerCase() === "preorder");

  // A product can sit in several rooms; label it with the first non-student/non-pre-order
  // room if it has one, or Pre-Order if it is exclusively in Pre-Order.
  const category =
    [...product.categories]
      .sort((a, b) => a.category.position - b.category.position)
      .find((c) => c.category.slug !== "student" && c.category.slug !== "pre-order")?.category ??
    product.categories[0]?.category ?? { name: "", slug: "" };

  const badgeTag = product.tags.find((tag) => BADGES[tag.toLowerCase()]);
  const [primary, secondary] = product.images;

  const swatches = (product.options ?? [])
    .flatMap((option) => option.values)
    .filter((value): value is { value: string; hexColor: string } => Boolean(value.hexColor))
    .slice(0, 4)
    .map((value) => ({ name: value.value, hex: value.hexColor }));

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
    badge: isPreorder ? "Pre-Order" : badgeTag ? BADGES[badgeTag.toLowerCase()] : null,
    isPreorder,
    preorderLeadTime: product.preorderLeadTime ?? (isPreorder ? "2–3 weeks" : null),
    preorderDepositPercent: product.preorderDepositPercent ?? null,
    imageUrl: primary?.url ?? null,
    imageAlt: primary?.alt ?? product.title,
    hoverImageUrl: secondary?.url ?? null,
    variantId: product.variants.length === 1 ? product.variants[0].id : null,
    inStock: isPreorder ? true : isInStock(product),
    swatches,
  };
}
