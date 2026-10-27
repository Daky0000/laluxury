import { isInStock, type ProductCard } from "./catalog";
import { publicAssetUrl } from "./media-url";

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
  badges: string[];
  variantCount: number;
  minimumOrderQuantity: number;
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
  bestseller: "Best Seller",
  "best seller": "Best Seller",
  "best-seller": "Best Seller",
  "best sellers": "Best Sellers",
  "bestsellers": "Best Sellers",
  new: "New",
  "new in": "New",
  "new-in": "New",
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

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const isNewProduct = product.createdAt ? (now - new Date(product.createdAt).getTime()) <= SEVEN_DAYS_MS : false;
  const isNewVariety = product.variants ? product.variants.some((v) => v.createdAt && (now - new Date(v.createdAt).getTime()) <= SEVEN_DAYS_MS) : false;
  const hasNewTag = product.tags.some((t) => {
    const clean = t.toLowerCase().trim();
    return clean === "new" || clean === "new in" || clean === "new-in";
  });
  const isNew = isNewProduct || isNewVariety || hasNewTag;

  const badgeTag = product.tags.find((tag) => BADGES[tag.toLowerCase()]);
  const onSale = product.compareAtPrice !== null && product.compareAtPrice > product.minPrice;

  const badges: string[] = [];
  if (isPreorder) {
    badges.push("Pre-Order");
  } else {
    if (badgeTag && BADGES[badgeTag.toLowerCase()] !== "New") {
      badges.push(BADGES[badgeTag.toLowerCase()]);
    }
    if (isNew && !badges.includes("New")) {
      badges.push("New");
    } else if (badgeTag && BADGES[badgeTag.toLowerCase()] === "New" && !badges.includes("New")) {
      badges.push("New");
    }
    if (onSale && !badges.includes("Sale")) {
      badges.push("Sale");
    }
  }

  const badge = badges[0] ?? null;
  const variantCount = product.variants?.length ?? 0;
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
    badge,
    badges,
    variantCount,
    minimumOrderQuantity: product.minimumOrderQuantity,
    isPreorder,
    preorderLeadTime: product.preorderLeadTime ?? (isPreorder ? "2–3 weeks" : null),
    preorderDepositPercent: product.preorderDepositPercent ?? null,
    imageUrl: primary ? publicAssetUrl(primary.url) : null,
    imageAlt: primary?.alt ?? product.title,
    hoverImageUrl: secondary ? publicAssetUrl(secondary.url) : null,
    variantId: product.variants.length === 1 ? product.variants[0].id : null,
    inStock: isPreorder ? true : isInStock(product),
    swatches,
  };
}
