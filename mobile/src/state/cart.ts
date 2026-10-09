import type { CartItem, Product, ServerCartItem, Variant } from "../types";

/**
 * Pure bag operations. No network, no storage - so they are unit tested and
 * the screens and the context share one definition of "add to bag".
 */

/** Converts server cart lines into the app's CartItem shape. */
export function serverCartToLocalCart(items: ServerCartItem[]): CartItem[] {
  return items.map((item) => ({
    product: {
      id: item.variant.productId,
      title: item.variant.product.title,
      slug: item.variant.product.slug,
      status: "ACTIVE" as const,
      minPrice: item.variant.price,
      maxPrice: item.variant.price,
      compareAtPrice: item.variant.compareAtPrice,
      brand: null,
      material: null,
      isFeatured: false,
      minimumOrderQuantity: item.variant.product.minimumOrderQuantity ?? 1,
      isPreorder: Boolean(item.variant.product.isPreorder),
      tags: [],
      totalStock: item.availableStock ?? 10,
      variantCount: 1,
      imageCount: item.variant.product.imageUrl ? 1 : 0,
      images: item.variant.product.imageUrl
        ? [{ id: "img-1", url: item.variant.product.imageUrl, alt: null, position: 0 }]
        : [],
      categories: [],
      collections: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    },
    variant: {
      id: item.variant.id,
      title: item.variant.title,
      sku: item.variant.sku,
      price: item.variant.price,
      compareAtPrice: item.variant.compareAtPrice,
      costPrice: null,
      isActive: true,
    },
    quantity: item.quantity,
  }));
}

/** The variant a product is added as when none was picked. */
export function defaultVariantFor(product: Product): Variant {
  if (product.variants && product.variants.length > 0) return product.variants[0];
  return {
    id: `${product.id}-default`,
    title: "Default",
    sku: product.slug,
    price: product.minPrice,
    compareAtPrice: product.compareAtPrice,
    costPrice: null,
    isActive: true,
  };
}

export function addLine(
  cart: CartItem[],
  product: Product,
  variant: Variant | undefined,
  qty: number,
): { cart: CartItem[]; variant: Variant } {
  const line = variant ?? defaultVariantFor(product);
  const idx = cart.findIndex((item) => item.variant.id === line.id);
  if (idx > -1) {
    const next = [...cart];
    next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
    return { cart: next, variant: line };
  }
  return { cart: [...cart, { product, variant: line, quantity: qty }], variant: line };
}

export function addLines(
  cart: CartItem[],
  items: { product: Product; variant: Variant; quantity: number }[],
): CartItem[] {
  let next = cart;
  for (const { product, variant, quantity } of items) {
    if (quantity <= 0) continue;
    next = addLine(next, product, variant, quantity).cart;
  }
  return next;
}

/** Changes a line by `delta`; a line that reaches zero is removed. */
export function changeQuantity(
  cart: CartItem[],
  variantId: string,
  delta: number,
): { cart: CartItem[]; quantity: number } {
  let quantity = 0;
  const next = cart
    .map((item) => {
      if (item.variant.id !== variantId) return item;
      quantity = item.quantity + delta;
      if ((item.product.minimumOrderQuantity ?? 1) > 1) quantity = Math.max(item.product.minimumOrderQuantity!, quantity);
      return quantity > 0 ? { ...item, quantity } : null;
    })
    .filter((item): item is CartItem => item !== null);
  return { cart: next, quantity: Math.max(0, quantity) };
}

/** Bag subtotal in minor units. Display only; the server prices the order. */
export function cartSubtotal(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.variant.price * item.quantity, 0);
}

export function cartItemCount(cart: CartItem[]): number {
  return cart.reduce((sum, item) => sum + item.quantity, 0);
}
